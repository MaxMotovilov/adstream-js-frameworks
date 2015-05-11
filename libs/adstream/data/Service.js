// Copyright (C) 2013-2015 12 Quarters Consulting
// Copyright (C) 2010-2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.data.connect' );
dojo.provide( 'adstream.data.Service' );

dojo.require( 'adstream.data.schema' );
dojo.require( 'adstream.data.extensions._Session' );

adstream.data._urlDepth = function( url ) {
	return url ? url.replace( /[^\/]+/g, '' ).length + 1 : 0;
}

adstream.data._filter = function( src, flt, dst ) {
	dst = dst || [];
	for( var i=0; i<src.length; ++i ) {
		var v = src[i] && flt( src[i] );
		if( v )	dst.push( v );
	}
	return dst;
}

adstream.data._isPrefix = function( a, b ) {
	return a == b.substr( 0, a.length );
}

adstream.data._collectOnSyncItemsFrom = function( list, path, remaining_depth, bind_to, dst ) {

	dst = dst || [];

	if( !bind_to )	throw Error( "BUG -- attempt to trigger watch on a non-existing object" );

	adstream.data._filter( list, function( item ) {
		return item.max_depth >= remaining_depth && {
			url:		path,
			item : 		item,
			obj:		bind_to,
			max_depth: 	item.max_depth - remaining_depth,
			min_depth: 	item.min_depth - remaining_depth
		};
	}, dst );

	return dst;
}

adstream.data._collectOnSyncItems = function( url, obj, bind_to ) {
	var depth = adstream.data._urlDepth( url ),
		result = [],
		path = '',
		s = adstream.data._descend( 
			url, obj, 
			function( obj, path_item ) {
				if( obj._ ) adstream.data._collectOnSyncItemsFrom( obj._, path, depth, bind_to, result );
				--depth;
				path += (path ? '/' : '') + path_item;
				bind_to = bind_to[path_item];
				return obj[path_item] || null;
			}
		);

	if( !s.rel_url && s.obj._ )
		adstream.data._collectOnSyncItemsFrom( s.obj._, path, depth, bind_to, result );

	s.list = result;

	return s;
}

adstream.data._contentTypeInList = function( ct, cts ) {
	ct = ct.split( /\s*;\s*/, 1 )[0].toLowerCase();
	return dojo.some( cts, function( ctl ) {
		return ctl.split( /\s*;\s*/, 1 )[0].toLowerCase() == ct;
	} );
}

dojo.declare( 'adstream.data.Service', null, {

	acceptContentTypes: [ 'application/json', 'application/x-javascript', 'text/javascript', 'text/x-javascript', 'text/x-json' ],

	constructor: function( ep_url ) {
		this._ep_url = ep_url;
		if( !/[\/]$/.test( this._ep_url ) )	this._ep_url += '/';

		this._on_sync = {};
		this._refresh_queue = [];
		this._on_sync_id = 0;
		this._pending_gets = {};
	},

	watch: function( cb, rel_url, options ) {
		cb._on_sync_id = cb._on_sync_id || ++this._on_sync_id;
		adstream.data._descend( rel_url, this._on_sync, function( obj, path_item ) {
			return obj[path_item] = obj[path_item] || { _: [] };
		} ).obj._.push( {
			cb: 		cb, 
			max_depth: 	options && options.maxDepth || 0, 
			min_depth: 	options && options.minDepth || 0,
			refresh: 	options && options.refreshRate || 0
		} );

		if( options && options.refreshRate ) {
			this._clearRefreshTimer();
			this._startRefreshTimer( 0 );
		}

		return cb ? rel_url + ':' + cb._on_sync_id : rel_url;
	},

	_newTopic: (function() {
		var id = 0;
		return function() {	return this._topic = ++id; }
	})(),

	topic: function() {
		return '/adstream/data/' + (this._topic || this._newTopic());
	},

	ignore: function( rel_url, cb ) {

		var parent = null, 
			last_path_item = null,
			match;
			
		if( cb )	cb = cb._on_sync_id;
		else if( match = /:\d+$/.exec( rel_url ) ) {
			rel_url = rel_url.substr( 0, match.index );
			cb = parseInt( match[0].substr( 1 ) );
		}

		if( !adstream.data._descend( rel_url, this._on_sync, function( obj, path_item ) {
				return (parent = obj)[last_path_item = path_item]||null;
			} ).rel_url ) {
		
			if( cb )	dojo.forEach( parent[last_path_item]._, function( item, i, all ) {
				if( item /* working around the quirk in dojo.forEach() */ && item.cb._on_sync_id == cb )
					all.splice( i, 1 );
			})
		
			if( !cb || parent[last_path_item]._.length == 0 ) {	
				delete parent[last_path_item];
				this._purgeRefreshQueue( rel_url, 9999 );
			}
		}

		return cb ? rel_url + ':' + cb : rel_url;
	},

	// FIXME: deprecated, use topic messages instead
	catchAll: function( cb ) {
		var	old = this._error_cb || null;
		this._error_cb = cb;
		return old;
	},

	_makeResult: function() {
		var	result = new dojo.Deferred();
		if( this._topic || this._error_cb )	
			result.then( 
				dojo.hitch( this, success ),
				dojo.hitch( this, failure )
			);
		return result;

		function success( result ) {
			if( this._topic )
				dojo.publish( this.topic(), result );
		}

		function failure( err ) {
			if( this._topic )
				dojo.publish( this.topic() + "/error", err );
			if( this._error_cb )
				this._error_cb( err );
		}
	},

	_xhr: function( method, seed, rel_url, params, result ) {

		if( !result )	result = this._makeResult();

		seed.url = this._ep_url + rel_url;
		seed.handle = dojo.hitch( this, '_ioComplete', result, method, rel_url );

		if( this.acceptContentTypes && this.acceptContentTypes.length )
			dojo.mixin( seed.headers || (seed.headers={}), { 'Accept': this.acceptContentTypes.join( ', ' ) } );

		if( params && (method in { PUT:1,POST:1 }) )
				seed.url += '?' + dojo.objectToQuery( params );
		else 	seed.content = params || {};			

		result.xhrPromise = dojo.xhr( method, seed );

		return result;
	},

	GET: function( rel_url, params ) {

		this._purgeRefreshQueue( rel_url, params.depth || 0 );

		var	existing;
	
		if( existing = this._pending_gets[rel_url] ) {
		
			if( existing.params == dojo.objectToQuery( params ) )
				return existing.result;
			if( existing.result.xhrPromise ) {
				existing.result.cancelled = true;
				existing.result.xhrPromise.cancel(); // adstream.data promises are not cancelable
				delete  existing.result.xhrPromise;
			}
		}

		return (this._pending_gets[ rel_url ] = {
			params: dojo.objectToQuery( params ),
			result: this._paused === 'all' ? this._makeResult() : this._xhr( "GET", { failOk: true }, rel_url, params )
		}).result;
	},

	DELETE: function( rel_url, params ) { 
		this._purgeRefreshQueue( rel_url, 65535 );
		return this._xhr( "DELETE", {}, rel_url, params ); 
	},

	POST: function( rel_url, body, params ) {
		return this._xhr( "POST", { postData: dojo.toJson( body ), headers: { 'Content-Type': 'application/json' } }, rel_url, params );
	},

	PUT: function( rel_url, body, params ) {
		return this._xhr( "PUT", { putData: dojo.toJson( body ), headers: { 'Content-Type': 'application/json' } }, rel_url, params );
	},

	push: function( data, arg_url ) {
		var p = this._makeResult();
		try {
			p.resolve( this._sync( data, arg_url || "" ) );
		} catch( e ) {
			p.reject( e );
		}
	},

	_ioComplete: function( promise, method, arg_url, response, ioargs ) {

		var	err = null, result = null, 
			headers = {}, cancelled = promise.cancelled;

		if( !cancelled && ioargs && ioargs.xhr.readyState >= 2 ) 
			dojo.forEach( ( ioargs.xhr.getAllResponseHeaders() || "" )
				.split( /\s*\n/ ), function( hdr ) {
					var kv = hdr.split( /:\s*/ ),
						key = kv[0].toLowerCase().replace( /(?:^|-)./g, function( s ){ return s.toUpperCase(); } );
					if( kv[0] ) {
						if( key in headers ) {
		 					if( !(headers[key] instanceof Array) )	headers[key] = [ headers[key], kv[1]||"" ];
							else	headers[key].push( kv[1]||"" );
						} else		headers[key] = kv[1]||"";
					}
				} );

		if( !response && !ioargs.xhr.status ) {
			//	Dojo failed to signal connection loss as an error :(
			err = new Error( "Connection to service failed" );
		} else if( response instanceof Error ) {
			//	Error detected by dojo.xhr() -- timeout, HTTP code etc.
			err = response;
			response = response.responseText || ioargs && ioargs.xhr.readyState == 4 && ioargs.xhr.responseText || '';
		}

		if( method === 'GET' && !cancelled && this._pending_gets.hasOwnProperty( arg_url ) )
			delete this._pending_gets[ arg_url ];

		if( !cancelled && ioargs.xhr.readyState == 4 && (!err || ioargs.xhr.status) ) { // The request has completed and was not cancelled
			var	content_type = headers[ 'Content-Type' ];

			if( this.rejectContentTypes ? 
				content_type && adstream.data._contentTypeInList( content_type, this.rejectContentTypes ) :
				!content_type || !adstream.data._contentTypeInList( content_type, this.acceptContentTypes ) ) {
				if( ioargs.xhr.status < 400 )	err = new Error( "Unexpected content type returned: " + content_type );
			} else if( response ) {
				var json;
				try { json = JSON.parse( response ); } catch( e ) {
					err = new Error( "Malformed response from the server: bad JSON syntax" );
				}
				if( json )	try { result = this._sync( json, arg_url ); } catch( e ) { err = e; }
			}
		}

		if( err || cancelled ) {
			if( method !== 'GET' || this._paused !== 'all' ) {
				if( !err ) 
					err = new Error( "Request cancelled" );
				err.ioargs = ioargs;
				err.responseHeaders = headers;
				err.status = ioargs.xhr.status;
				err.responseText = response;
				if( cancelled )	
					err.dojoType = 'cancel';
				promise.reject( err );
			}
		} else if( typeof result === 'object' )	{
			promise.resolve( result );	//	Method call with return value
		} else {
			var d = adstream.data._descend( arg_url, this.root );
			if( !d.obj )
				promise.reject( new Error( "Protocol violation: no relevant data returned for " + arg_url ) );
			else
				promise.resolve( d.obj );
		}

		return null;
	},

	_sync: function( response, arg_url ) {

		//	Step I: seed the processing queue with all top-level branches in the response

		var result, q = [];

		for( var i in response ) 
			if( i.indexOf('/') >= 0 ) {
				// These items ought to be processed by their respective containers
				var split_url = [ null, null, i ], parent = response;
				do {
					split_url = /^([^\/]*)\/(.*)$/.exec( split_url[2] );
					parent = parent[ split_url[1] ] = parent[ split_url[1] ] || {};
					if( !parent._ )	parent._ = { partial: true };
				} while( split_url[2].indexOf('/') >= 0 );
							
				parent[split_url[2]] = response[i];
				delete response[i];
			}

		for( var i in response ) {

			if( i == '_' )
				i = '';
			else if( i.charAt(0) == '_' )	
				continue;

			var d = adstream.data._descend( i, this.root, adstream.data.schema._byAutoInstantiatedSchema ),
				s = adstream.data._collectOnSyncItems( i, this._on_sync, this.root ),
				next = null;
			
			if( d.rel_url && (next = d.obj._schemaProp( d.rel_url )) instanceof adstream.data.schema.Node )
				d.obj = d.obj[ d.rel_url ] = next._new( this, d.obj._composeURL( d.rel_url ) );
			else if( next && arg_url == i )
				result = response[i];
			else if( d.rel_url && !(d.obj instanceof adstream.data.schema.Connector) /* which should forward everything under itself */ )
				throw Error( "Protocol violation: " + i + " is not a valid response to " + arg_url );

			q.push( { 
				url: i, obj: d.obj, data: i ? response[i] : response,
				sync_list: s.list, sync_more: !s.rel_url && s.obj 
			} );
		}

		//	Step II: descend each branch in response, unmarshalling the object representations and collecting notifications

		var	on_sync = [];

		while( q.length ) {

			var qi = q.shift(),	
				props = {};

			for( var i in qi.data ) {
				
				var p = qi.obj._schemaProp( i );

				if( p instanceof adstream.data.schema.Node ) {
					
					props[i] = qi.data[i];
					delete qi.data[i];

				} else if( p ) {
					if( arg_url == qi.obj._composeURL( i ) )
						// Return value for method call embedded within object representation	
						result = qi.data[i];
					else throw Error( "Protocol violation: " + qi.obj._composeURL( i ) + " is not a valid response to " + arg_url );
					delete qi.data[i];
				}
			}

			var sync_list = [],
				modified = qi.obj._unmarshal(
					qi.data, props,
					// Optimization: should we preserve old object content?
					dojo.some( qi.sync_list, function(i){ return i.min_depth <= 0; } )
				),
				ts = (new Date()).valueOf();
			
			dojo.forEach( qi.sync_list, function( item ) {

				if( item.min_depth <= 0 ) {
					if( item.item.refresh )
						item.item.last_updated = ts;
						
					if( modified ) {
						if( typeof modified === 'object' )
							item.old = modified;
						on_sync.push( item );
						return;
					}
				}
					
				if( item.max_depth >= 1 ) {
					item.max_depth--;
					item.min_depth--;
					sync_list.push( item );
				}
			} );

			var	replaced = qi.obj._.url != qi.url;
			if( replaced )	qi.obj._.url = qi.url; // Fixing @N URLs

			for( var i in props ) {

				var next_url = (qi.url && (qi.url+'/')) + i;

				if( props[i] ) {

					if( !qi.obj.hasOwnProperty( i ) )
						qi.obj[i] = qi.obj._schemaProp( i )._new( this, qi.obj._composeURL( i ) );

					var new_qi = {
						url: next_url, obj: qi.obj[i], data: props[i], 
						sync_more: qi.sync_more && qi.sync_more[i]
					};

					new_qi.sync_list = sync_list.slice( 0 ); // Shallow copy
	
					if( new_qi.sync_more )
						adstream.data._collectOnSyncItemsFrom( new_qi.sync_more._, new_qi.url, 0, new_qi.obj, new_qi.sync_list );

					q.push( new_qi );

				} else if( next_url == arg_url ) result = null;
			}

			if( replaced ) 
				for( var i in qi.obj )
					if( qi.obj.hasOwnProperty(i) && !( i in props ) && qi.obj[i] && qi.obj[i]._ )
						qi.obj[i]._.url = qi.obj._composeURL( i ); // Fixing @N URLs in cache-only properties
		}

		//	Step III: disambiguate and fire the notifications
		
		on_sync.sort( function( a, b ) { 
			return a.url.localeCompare( b.url ) || a.item.cb._on_sync_id - b.item.cb._on_sync_id;
		} );

		var url = null, from = 0, curr;

		function fireCallbacks() {
			var last_id = 0;
			while( from < curr ) {
				var item = on_sync[from++];
				if( last_id != item.item.cb._on_sync_id ) {
					item.item.cb( item.obj, item.old );
					if( item.item.refresh && !this._refresh_timer )	
						this._startRefreshTimer( 0 );
					last_id = item.item.cb._on_sync_id;
				}
			}
		}

		for( curr=0; curr<on_sync.length; ++curr )
			if( url !== on_sync[curr].url ) {
				fireCallbacks.call( this );
				url = on_sync[curr].url;
			}

		fireCallbacks.call( this );

		return result;
	},

	_startRefreshTimer: function( ms ) {
		if( !this._paused )
			this._refresh_timer = dojo.global.setTimeout( dojo.hitch( this, this._onRefresh ), ms );
	},

	_purgeRefreshQueue: function( url, depth ) {
		var ad = adstream.data,
			d = depth + ad._urlDepth( url );

		for( var i=0; i<this._refresh_queue.length; ) {
			var q = this._refresh_queue[i];
			if( ad._isPrefix( url, q.url ) && d >= ad._urlDepth( q.url ) + q.depth )
				this._refresh_queue.splice( i, 1 );
			else ++i;
		}
	},

	_pushRefreshQueue: function( url, depth ) {
		var ad = adstream.data,
			d = depth + ad._urlDepth( url );

		for( var i=0; i<this._refresh_queue.length; ++i ) {
			var q = this._refresh_queue[i];
			if( ad._isPrefix( q.url, url ) && ad._urlDepth( q.url ) + q.depth >= d )
				return;
			else if( ad._isPrefix( url, q.url ) && d >= ad._urlDepth( q.url ) + q.depth ) {
				this._refresh_queue[i] = { url: url, depth: depth };
				return;
			}
		}

		this._refresh_queue.push( { url: url, depth: depth } );
	},

	_onRefresh: function( err ) {

		var	next = NaN;

		if( this._refresh_queue.length == 0 ) {
			
			var	queue = [ { d: this.root, w: this._on_sync } ],
				ts = (new Date()).valueOf();
		
			while( queue.length ) {
				var q = queue.shift();
				for( var i in q.w )
					if( q.w.hasOwnProperty(i) && q.d.hasOwnProperty(i) ) {
						for( var j in q.w[i]._ )
							if( q.w[i]._[j].refresh ) {
								var ripe = (q.w[i]._[j].last_updated||0) + q.w[i]._[j].refresh;
								if( ripe <= ts ) {
									q.w[i]._[j].last_updated = ts;
									this._pushRefreshQueue( q.d[i].url(), q.w[i]._[j].max_depth );
								}
								else if( isNaN(next) || next > ripe )
									next = ripe;
							}
						queue.push( { d: q.d[i], w: q.w[i] } );
					}
			}
		}

		if( this._refresh_queue.length != 0 ) {
			var me = dojo.hitch( this, this._onRefresh );
			this.root.get( this._refresh_queue[0].url, this._refresh_queue[0].depth, true ).then( me, me );
		} else {
			if( isNaN(next) )	delete this._refresh_timer;
			else 				this._startRefreshTimer( next - ts );
		}

		if( err && err instanceof Error )	throw err;			
	},

	_clearRefreshTimer: function() {
		if( this._refresh_timer ) {
			dojo.global.clearTimeout( this._refresh_timer );
			delete this._refresh_timer;
		}
	},

	pause: function( all ) {
		this._paused = all ? "all" : "auto";
		this._refresh_queue = [];
		this._clearRefreshTimer();
		if( all )
			for( var rel_url in this._pending_gets ) {
				var result = this._pending_gets[ rel_url ].result;
				if( result.xhrPromise ) {
					result.cancelled = true;
					result.xhrPromise.cancel();
					delete result.xhrPromise;
				}
			}
	},
	
	resume: function( discard ) {
		if( this._paused ) {
			delete this._paused;
			for( var rel_url in this._pending_gets )
				if( this._pending_gets.hasOwnProperty( rel_url ) ) {
					if( discard )	delete this._pending_gets[ rel_url ];
					else this._xhr( "GET", { failOk: true }, rel_url, dojo.queryToObject( this._pending_gets[rel_url].params ), this._pending_gets[rel_url].result );
				}
			this._onRefresh();
		}	
	}
} );

adstream.data.connect = (function() {

	var ServiceWithSession = 
			dojo.declare( adstream.data.Service, {
				_xhr: function() {
					arguments[3] = this.root._injectSessionProperties( arguments[3] );
					return this.inherited( arguments );
				}
			} );		

	return function( ep_url, options, schema ) {

		if( !schema ) {
			schema = options;
			delete options;
		}

		var svc = new (schema._sessionProperties ? ServiceWithSession : adstream.data.Service)( ep_url, options || {} );
		svc.root = schema._new( svc, '' );

		if( schema._sessionProperties )
			(new adstream.data.extensions._Session()).install( svc.root );

		return svc.root; 
	}
})();
