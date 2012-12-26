// Copyright (C) 2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.navigator.core' );

dojo.require( 'adstream.navigator.util' );

(function(){

if( !navigator.config )
	navigator.config = {};

var src_map = [];

adstream.navigator.on = function( pattern ) {
	var e = new MapEntry( pattern );
	src_map.push( e );
	return e;
};

adstream.navigator.core.mapper = function() {

	var map = {}, src = [];

	dojo.forEach( src_map, function(e) {
		var key = "";
		e._matchSequence.replace( /\((?!\?)([^)]+)\)/g, function( _, k ) {
			k = k.replace( /\\\//g, '/' );
			if( k != ':' )
				key += k;
			return "";
		} );

		function set(k) {
			if( k in map )
				throw Error( 'Patterns ' + e._pattern + ' and ' + map[k]._pattern + ' are in conflict' );
			map[k] = e;
		}

		function set2(k) {
			if( e._action !== "m" )	set(k);
			if( e._action )			set(k+':');
		}

		set2( key );
		if( e._opt )	set2( key.replace( /\/[^\/]+$/, '' ) );

		src.push( e._matchSequence );
	} );

	src.sort();
	var regex = new RegExp( "^" + combineRegexes( src ) );

	return function mapper( hash ) {
		return map[
			dojo.map(
				(regex.exec( hash ) || []).slice( 1 ),
				function(s){ return s||""; }
			).join( '' )
		];
	};
};

var MapEntry = dojo.extend(
	function MapEntry( pattern ) {
		var	action = /(?::.*)?$/.exec( pattern )[0],
			path = dojo.filter(
				pattern.substr( 0, pattern.length - action.length ).split( '/' ),
				function(s){ return s; }
			),
			subs = 0, match = "", parse = "", opt, trailing;

		dojo.forEach( path, function(s,i) {
			if( s=='*' ) {
				match += ( i ? '(\\/)' : '' ) + '[^\\/:\\?]+';
				parse += ( i ? '\\/' : '' ) + '([^\\/:\\?]+)';
				++subs;
			} else if( s=='**' ) {
				if( i < path.length-1 || action )
					throw Error( 'Placeholder ** can only be used at the end of ' + pattern );
				match += ( i ? '\\/?' : '' ) + '.*$';
				parse += ( i ? '\\/?' : '' ) + '(.*)$';
				++subs;
				trailing = true;
			} else if( s.indexOf('*')>= 0 )
				throw Error( 'Bad placeholder ' + s + ' in ' + pattern );
			else {
				opt = i==path.length-1 && /\?$/.test( s );
				if( opt )	s = s.substr( 0, s.length-1 );

				function wrap( str ) {
					return (opt ? '(?:' : '' ) + str + ( opt ? ')?' : '' );
				}

				match += wrap( '(' + ( i ? '\\/' : '' ) + s + ')' );
				parse += wrap( ( i ? '\\/' : '' ) + s );
			}
		} );

		if( action ) {
			 if( !(action = /^:(\*|[a-zA-Z][a-zA-Z0-9_]*(?:,[a-zA-Z][A-Za-z0-9_]*)*\??)$/.exec( action )) )
				throw Error( 'Bad action suffix in ' + pattern );

			var action_opt = action[1] == '*' || action[1].charAt(action[1].length-1) == '?';

			if( action_opt ) {
				match += '(?:';
				parse += '(?:';
			}

			match += '(:)';
			parse += ':';

			if( action[1] == '*' ) {
				match += '[a-zA-Z][A-Za-z0-9_]*';
				parse += '([a-zA-Z][A-Za-z0-9_]*)';
			} else {
				var list = action[1].replace( /\??$/, '' ).replace( /,/g, '|' );
				match += list.indexOf('|') >= 0 ? '(?:' + list + ')' : list;
				parse += '(' + list + ')';
			}

			if( action_opt ) {
				match += '|\\/?)';
				parse += '|\\/?)';
			}

		} else if( !trailing )
			parse += '\\/?';

		dojo.mixin( this, {
			_pattern:		pattern,
			_matchSequence:	match + (trailing ? '' : ( action ? '(?:\\?|$)' : '\\/?(?:\\?|$)' )),
			_parseRegex:	new RegExp( "^" + parse + (trailing ? '' : '(?:\\?(.*))?$') ),
			_pathFormat:	parse.replace( /:\(.*$/, '' ).replace( /\\\/\?$/, '' ).replace( /\([^)]+\)/g, '*' ).replace( /\\\//g, '/' ),
			_subs:			subs,
			_action:		action ? action_opt ? "o" : "m" : "",
			_opt:			opt,
			_execute:		[]
		} );
	}, {
		execute: function( hash, dom_node_id ) {
			var	args = this._parseRegex.exec( hash );
			if( !args )	return new Error( 'Bad hash ' + hash );

			var parsed = new ParsedHash( this, {

				// Should be removed!
				url:		this._pattern.replace(/\?$/,'').split('/'),

				key: 		args.slice( 1, this._subs+1 ),
				action: 	this._action ? args[this._subs+1] : '',
				parameters:	{},
				namedKey:	getExtendIds(hash, this._pattern),

				_controlledNode: dom_node_id
			} );

			dojo.forEach(
				( args[ this._subs+(this._action?1:0)+1 ] || '').split('&'),
				function( p ) {
					var	spl = /^([^=]+)=(.*)$/.exec( p );
					if( spl )	parsed.parameters[spl[1]] = spl[2];
				}
			);

			if( !this._execute.length )
				return new Error( 'No action associated with ' + this._pattern );

			dojo.publish( "/adstream/navigator/changing", [parsed] );

			return dojo.when(
				dojox.promise.allOrNone( 
					dojo.map( this._execute, function(x) {
						try {
							if( x._execute.length )
								return x._resolve( parsed, x.callbacks );
						} catch( err ) {
							return err;
						}
					} )
				),
				function( result ) {
					dojo.publish( "/adstream/navigator/changed", [parsed] );
					return result;
				},
				function( err ) {
					dojo.publish( "/adstream/navigator/error", [err] );
					return err;
				}
			);
		},

		_resolve: function( hash, cbs ) {
			return dojox.promise.allOrNone(
				dojo.map( cbs, function( cb ) {
					cb( this._getArguments( hash ), hash );
				}, this )
			);
		},

		_getArguments: function( hash ) {
			return hash.key;
		},

		_getArgumentsFromAdstreamData: function( paths ) {

			if( !this._execute.length || this._execute[0].hasOwnProperty( '_getArguments' ) ||
				this._execute[0].hasOwnProperty( '_execute' ) )
				this._execute.unshift( dojo.delegate( this, {} ) );

			paths = dojo._toArray( paths );
			var root = isAdstreamDataNode( paths[0] ) ? paths.shift() : adstream.navigator.config.schemaRoot;

			if( !root ) throw Error( "Schema root is not specified or configured" );

			if( paths.length > 1 || typeof paths[0] !== 'object' )
				this._execute[0]._getResolvedArguments = compose( 
					this._execute[0]._getArguments = pathsFromHash( paths ),
					dojox.promise.allOrNone
				);
			else {
				var keys = [], values = [];
				for( var key in paths[0] ) {
					values.push( paths[0][key] );
					keys.push( key );
				}

				this._execute[0]._getArguments = compose(
					pathsFromHash( values ),
					rebuildDict
				);

				this._execute[0]._getResolvedArguments = compose(
					pathsFromHash( values ),
					dojox.promise.allOrNone,
					function( v ) {
						return dojo.when( v, rebuildDict );
					}
				);

				function rebuildDict( values ) {
					var result = {};
					for( var i=0; i<keys.length; ++i )
						result[keys[i]] = values[i];
					return [result];
				}
			}

			function pathsFromHash( paths ) {
				return function( hash ) {
					return dojo.map( paths, function( path ) {

						if( typeof path === 'function' )
							return path.call( hash, hash );

						var depth;
						path = hash
							.fillKeyFields( path )
							.replace( /:(\d+)$/, function( _, d ) {
								depth = parseInt( d );
								return "";
							} );

						var obj = getCached( root, path );
						if( obj && obj.view ) hash.fillMetadata( obj.view() );
						if( obj && obj.filter ) hash.fillMetadata( obj.filter() );

						return root.get( path, depth );
					} );
				}
			}
		},

		get: function( /* [ root, ] dict | path1...pathN */ ) {
			this._getArgumentsFromAdstreamData( arguments );
			return this;
		},

		getw: function( /* [ root, ] dict | path1...pathN */ ) {

			this._getArgumentsFromAdstreamData( arguments );

			this._execute[0]._resolve = function( hash, cbs ) {
				return dojo.when(
					this._getResolvedArguments( hash ),
					function( args ) {
						return dojox.promise.allOrNone(
							dojo.map( cbs, function( cb ) {
								cb( args, hash );
							} )
						);
					}
				);
			}					

			return this;
		},

		_call: function( ex ) {
			if( !this._execute[0].callbacks )
				this._execute[0].callbacks = [];
			this._execute[0].callbacks.push( ex );
			return this;
		},

		call: function( cb ) {
			if( !this._execute.length )
				this._execute.unshift( dojo.delegate( this, {} ) );
			this._execute[0]._call(
				function( args, hash ) {
					cb.apply( hash, args.concat( hash ) );
				}
			);
			return this;
		},

		load: function( url, node, place ) {
			if( !this._execute.length )
				this._execute.unshift( dojo.delegate( this, {} ) );

			this._execute[0]._call( function( _, hash ) {

				if( typeof url === 'function' )
					url = url.call( hash, hash );

				url = hash.fillKeyFields( url );

				return dojo.when(
					dojo.xhrGet({ url: url }),
					function( html ){
						dojo.place( html, 
							node && hash.fillKeyFields( node ) || hash.defaultView(), 
							place || 'only' 
						);
					},
					annotateError( "While retrieving " + url + ": " )
				);
			} );
			return this;
		},

		notify: function( cb, eb ) {

			if( !this._execute.length ||
				!this._execute[0].hasOwnProperty( '_getArguments' ) &&
				this._execute[0].callbacks.length == 0 
			)
				throw Error( "notify() cannot be associated with an empty chain" );

			var resolve = this._execute[0]._resolve;

			this._execute[0]._resolve = function() {
				return dojo.when(
					resolve.apply( this, arguments ),
					cb, eb
				);
			} 

			this._execute.unshift( dojo.delegate( this, {} ) );

			return this;
		},

		render: function( tpl, node, place ) {
			if( !this._execute.length )
				this._execute.unshift( dojo.delegate( this, {} ) );
			var	prefix;
			tpl = tpl.replace( /:([^*])*\*/,
				function( _, pfx ) {
					prefix = pfx;
					return '*';
				}
			);

			this._execute[0]._call(
				function( args, hash ) {
					var tpl_name  = tpl.replace( '*', hash.action && ( prefix + hash.action ) ), 
						anno = annotateError( "In " + tpl_name + ": " );

					if( !dojox || !dojox.jtlc || !dojox.jtlc.CHT || !dojox.jtlc.CHT.loader )
						throw Error( "CHT loader not available, require 'dojox.jtlc.CHT.loader'" );

					try {
						return dojo.when(
							dojox.jtlc.CHT.loader.get(
								tpl_name
							).call( 
								dojo.delegate( hash ), args.length==1 ? args[0] : args, hash 
							).render(
								node && hash.fillKeyFields( node ) || hash.defaultView(), 
								place || 'only' 
							),
							anno, anno
						);
					} catch( err ) {
						anno( err );
					}
				}
			);
			return this;
		},

		where: function( predicate ) {
			if( !this._execute.length )
				this._execute.unshift( dojo.delegate( this, {} ) );

			var allow,
				_call = this._call;

			this._execute[0]._call = function( ex ) {
				return _call.call(
					this,
					function() {
						return allow && ex.apply( this, arguments );
					}
				);
			}

			return this._call(
				function( args, hash ) {
					return allow = predicate.apply( hash, args.concat( hash ) );
				}
			);
		},

		on: function( pattern ) {
			return adstream.navigator.on( pattern );
		}
	}
);

var ParsedHash = dojo.extend(
	function( entry, props ) {
		this._mapEntry = entry;
		dojo.mixin( this, props );
		this.ext = this.namedKey; // Backward compatibility!
	}, {
		fillKeyFields: function( s ) {
			var i=0, _this = this;
			return s
				.replace( /\*/g, function(){ return _this.key[i++]; } )
				.replace( /:([a-z][a-z_0-9]*)/ig, function( _, key ) { return _this.namedKey[key]; } );
		},

		fillMetadata: function( meta ) {
			for( var i in this.params )
				if( i in meta )
					if( typeof meta[i] === 'number' )
						meta[i] = Number( this.params[i] );
					else
						meta[i] = this.params[i];
		},

		defaultView: function() {
			return firstMapped( 
				navigator.config.defaultViews || [ 'app-view', 'app-main' ],
				dojo.byId
			) || this._controlledNode;
		},

		toString: function() {
			var params = this._paramList();
			return (
				this._formatPath() +
				( this.action ? ":" + this.action : "" ) +
				( params.length ? "?" + params.join( "&" ) : "" )
			);
		},

		toAltString: function( props ) {
			if( props.namedKey )
				props.key = getMergedKey( this._mapEntry._pathFormat, props.key || this.key, props.namedKey );

			if( props.key && props.key.length < this.key.length ) {
				if( !props.action )		props.action = false;
				if( !props.parameters )	props.parameters = false;
			}

			return dojo.delegate( this, props ).toString();
		},

		_formatPath: function() {
			var i=0, _this = this;
			return this._mapEntry._pathFormat.replace( /\*/g, function() {
				return _this.key[i++] || '\uffff';
			} ).replace( /\/?\uffff.*$/, '' );
		},

		_paramList: function() {
			var result = [];
			for( var i in this.parameters )
				if( this.parameters[i] )
					result.push( i + '=' + this.parameters[i] );
			return result;
		}
	}
);

function compose() {
	var rest = arguments,
		first = rest[0];
	return function() {
		var v = first.apply( this, arguments );
		for( var i=1; i<rest.length; ++i )
			v = rest[i]( v );
		return v;
	}
}

function firstMapped( of, fn ) {
	var v;
	for( var i=0; i<of.length; ++i )
		if( v = fn( of[i] ) )
			break;
	return v;
}

function annotateError( msg_prefix ) {
	return function( err ) {
		if( !(err instanceof Error) )
			return err;

		err.message = msg_prefix + err.message;
		throw err;
	}
}

function isAdstreamDataNode( v ) {
	var node = dojo.getObject( 'adstream.data.schema.Node' );
	return typeof node === 'function' && v instanceof node;
}

function getExtendIds(hash, pattern) {
	if(!hash || !pattern) return {};
	var h = hash.replace(/(\:\w+)?(\?.*?)?$/g, '').split('/'),
		p = pattern.split('/'),
		res = {};
	for(var i=0; i < p.length; i++){
		p[i] = p[i].replace(/\:\w+$/g, '');
		if(p[i] == '*') res[h[i-1]] = h[i];
	}
	return res;
}

function getMergedKey( pattern, key, map ) {
	var result = [], n = 0;
	dojo.forEach( 
		pattern.split( '/' ),
		function( v, i, all ) {
			if( v == '*' ) {
				v = all[i-1] in map ? map[ all[i-1] ] : key[n];
				if( typeof v !== 'undefined' )
					result.push( v );
				++n;
			}
		}
	);
	return result;
}

function getCached( root, path )
{
	if( !path )	return root;
	dojo.forEach( path.split('/'), function(p) {
		if( root && root.hasOwnProperty(p) )
			root = root[p];
		else root = null;
	} );

	return root;
}

function isRepeat( c ) {
	return '*+?'.indexOf( c ) >= 0;
}

function mismatch( a, b ) {
	var	best = -1,
		l = Math.min( a.length, b.length );

	for( var i=0; i<l; ++i ) {

		if( a.charAt(i) != b.charAt(i) )
			break;

		if( a.charAt(i) == '(' )
			best = i-1;
		else if(
			isRepeat( a.charAt(i) ) && a.charAt(i-1) == ')' ||
			!isRepeat( a.charAt(i+1) ) && !isRepeat( b.charAt(i+1) ) && a.charAt(i) == ')'
		)
			best = i;
	}

	return best + 1;
}

function combineRegexes( inp ) {
	//	Merging a list of regexes into a prefix tree.
	//	c|_| -- to the sweet memories of kannuu 1.0

	var	stack = [],
		result = [];

	function append( prefix, word ) {

		var	suffix = "";

		while( result.length && prefix < result[0].prefix )
			suffix += '(?:' + result.shift().word + ')';

		if( !result.length || result[0].prefix < prefix )
			result.unshift( { prefix: prefix, word: word + suffix } );
		else if( result[0].prefix == prefix )
			result[0].word += '|' + word + suffix;
	}

	function toResult() {
		var v = stack.shift();
		if( stack.length )
			append( stack[0].length, v.substr( stack[0].length ) );
		else
			append( 0, v );
	}

	dojo.forEach( inp, function( word ) {

		while( stack.length > 1 && word.substr( 0, stack[1].length ) != stack[1] )
			toResult();

		if( stack.length > 0 ) {
			var common = mismatch( stack[0], word );
			if( common > ( stack.length == 1 ? 0 : stack[1].length ) ||
				common == stack[stack.length-1].length && stack[0].length > 2 ) {
				var v = stack.shift();
				stack.unshift( v.substr( 0, common ) );
				append( stack[0].length, v.substr( common ) );
			} else if( common < stack[0].length ) {
				toResult();
			}
		}

		stack.unshift( word );
	} );

	while( stack.length > 0 )
		toResult();

	return '(?:' + result.pop().word + ')';
}

})();
