dojo.provide( 'adstream.data.connect' );
dojo.provide( 'adstream.data.Service' );

dojo.require( 'adstream.data.schema' );

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

adstream.data._collectOnSyncItemsFrom = function( list, path, remaining_depth, dst ) {

	dst = dst || [];

	adstream.data._filter( list, function( item ) {
		return item.max_depth >= remaining_depth && {
			url:		path,
			cb : 		item.cb,
			max_depth: 	item.max_depth - remaining_depth,
			min_depth: 	item.min_depth - remaining_depth
		};
	}, dst );

	return dst;
}

adstream.data._collectOnSyncItems = function( url, obj ) {
	var depth = adstream.data._urlDepth( url ),
		result = [],
		path = '',
		s = adstream.data._descend( 
			url, obj, 
			function( obj, path_item ) {
				if( obj._ ) adstream.data._collectOnSyncItemsFrom( obj._, path, depth, result );
				--depth;
				path += (path ? '/' : '') + path_item;
				return obj[path_item] || null;
			}
		);

	if( !s.rel_url )
		adstream.data._collectOnSyncItemsFrom( s.obj._, path, depth, result );

	s.list = result;

	return s;
}

dojo.declare( 'adstream.data.Service', null, {

	constructor: function( ep_url ) {
		this._on_sync = {};
		this._ep_url = ep_url;
		if( !/[\/]$/.test( this._ep_url ) )	this._ep_url += '/';
		this._on_sync_id = 0;
	},

	on_sync: function( cb, rel_url, max_depth, min_depth ) {
		cb._on_sync_id = cb.__on_sync_id || ++this._on_sync_id;
		adstream.data._descend( rel_url, this._on_sync, function( obj, path_item ) {
			return obj[path_item] = obj[path_item] || { _: [] };
		} ).obj._.push( {
			cb: cb, max_depth: max_depth, min_depth: min_depth
		} );
	},

	_xhr: function( method, seed, rel_url, params ) {
		var	result = new dojo.Deferred();

		seed.url = this._ep_url + rel_url;
		seed.handle = dojo.hitch( this, '_ioComplete', result, rel_url );
		seed.handleAs = 'json';

		if( (method in { PUT:1,POST:1 }) && params )
				seed.url += '?' + dojo.objectToQuery( params );
		else 	seed.content = params || {};			

		dojo.xhr( method, seed );

		return result;
	},

	GET: function( rel_url, params ) { 
		return this._xhr( "GET", {}, rel_url, params ); 
	},

	DELETE: function( rel_url, params ) { 
		return this._xhr( "DELETE", {}, rel_url, params ); 
	},

	POST: function( rel_url, body, params ) {
		return this._xhr( "POST", { postData: dojo.toJson( body ) }, rel_url, params );
	},

	PUT: function( rel_url, body, params ) {
		return this._xhr( "PUT", { putData: dojo.toJson( body ) }, rel_url, params );
	},

	_ioComplete: function( promise, arg_url, response, ioargs ) {

		var	err = null, result = null;

		if( response instanceof Error ) {
			err = response;
			try {
				response = response.responseText && dojo.fromJson( response.responseText ) || null;
			} catch( e ) {
				response = null;
			}
		}

		if( response && response._error ) {
			err = new Error( response._error.message || err && err.message || 'Request failed' );
			if( response._error.message )	delete response._error.message;
			dojo.mixin( err, response._error );
			delete response._error;
		}

		try {
			result = this._sync( response, arg_url );
		} catch( e ) {
			err = e;
		}

		if( err )								promise.reject( err );
		else if( typeof result === 'object' )	promise.resolve( result );	//	Method call with return value
		else {
			var d = adstream.data._descend( arg_url, this.root );
			if( !d.rel_url || 												//	Resolved to the object
				(d.obj[d.rel_url] instanceof adstream.data.schema.Method) 	//	Method call w/o return value: return the object itself
			)		promise.resolve( d.obj );
			else	promise.reject( new Error( "Protocol violation: no relevant data returned for " + arg_url ) );
		}
	},

	_sync: function( response, arg_url ) {

		//	Step I: seed the processing queue with all top-level branches in the response

		var result, q = [];

		for( var i in response ) 
			if( !response[i] || response[i]._ && response[i]._.replaces ) {
				// These items ought to be processed by their respective containers
				var	split_url = adstream.data._splitURL( i );
				(response[split_url[1]] = response[split_url[1]] || {})[split_url[2]] = response[i];
				delete response[i];
			}

		for( var i in response ) {

			var s = adstream.data._collectOnSyncItems( i, this._on_sync ),
				d = adstream.data._descend( i, this.root, adstream.data.schema._byAutoInstantiatedSchema ),
				next = null;
			
			if( d.rel_url && (next = d.obj._schemaProp( d.rel_url )) instanceof adstream.data.schema.Node )
				d.obj = d.obj[ d.rel_url ] = next._new( this, d.obj._composeURL( d.rel_url ) );
			else if( next && arg_url == i )
				result = response[i];
			else if( d.rel_url )
				throw Error( "Protocol violation: " + i + " is not a valid response to " + arg_url );

			q.push( { 
				url: i, obj: d.obj, data: response[i], 
				sync_list: s.list, sync_more: !s.rel_url && s.obj 
			} );
		}

		//	Step II: descend each branch in response, unmarshalling the object representations and collecting notifications

		var	on_sync = [];

		while( q.length ) {

			var qi = q.shift(),	props = {};

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

			var sync_list = [];

			if( qi.data._ ) {
				if( qi.data._.depth )		qi.obj._.depth = qi.data._.depth;
				else if( qi.obj._.depth )	delete qi.obj._.depth;
			}

			if( qi.obj._.outOfSync )	delete qi.obj._.outOfSync;
		
			if( qi.obj._unmarshal( qi.data, props ) )
				adstream.data._filter(
					qi.sync_list,
					function( item ) {
						return item.min_depth <= 0 && {
							url: item.url, cb: item.cb, obj: qi.obj
						};
					}, on_sync
				);
			else
				adstream.data._filter(
					qi.sync_list,
					function( item ) {
						if( item.max_depth >= 1 ) {
							item.max_depth--;
							item.min_depth--;
							return item;
						}
						return null;
					}, sync_list
				);

			for( var i in props ) {

				if( props[i] ) {

					if( !qi.obj.hasOwnProperty( i ) )
						qi.obj[i] = qi.obj._schemaProp( i )._new( this, qi.obj._composeURL( i ) );

					var new_qi = {
						url: qi.url + '/' + i, obj: qi.obj[i], data: props[i], 
						sync_more: qi.sync_more && qi.sync_more[i]
					};

					new_qi.sync_list = new_qi.sync_more ?
						adstream.data._collectOnSyncItemsFrom( new_qi.sync_more._, new_qi.url, 0 ) :
						dojo.map( sync_list, function(i) {
							return {
								min_depth:	i.min_depth,
								max_depth:	i.max_depth,
								url:		new_qi.url,
								cb: 		i.cb
							};
						} );		

					q.push( new_qi );
				} else if( qi.url + '/' + i == arg_url ) result = null;
			}
		}

		//	Step III: disambiguate and fire the notifications
		
		on_sync.sort( function( a, b ) { 
			return a.url.localeCompare( b.url ) || a.cb._on_sync_id - b.cb._on_sync_id;
		} );

		var url = null, from = 0, curr;

		function fireCallbacks() {
			var last_id = 0;
			while( from < curr ) {
				var item = on_sync[from++];
				if( last_id != item.cb.id ) {
					item.cb( item.obj ); 
					last_id = item.cb.id;
				}
			}
		}

		for( curr=0; curr<on_sync.length; ++curr )
			if( url !== on_sync[curr].url ) {
				fireCallbacks();
				url = on_sync[curr].url;
			}

		fireCallbacks();

		return result;
	}
} );

adstream.data.connect = function( ep_url, schema ) {
	var svc = new adstream.data.Service( ep_url );
	svc.root = schema._new( svc, '' );
	return svc.root; 
}
