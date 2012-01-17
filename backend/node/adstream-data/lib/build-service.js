// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var d = require( './lang.js' ),
	packet = require( './packet.js' );

d.mixin( d, require( 'node-promise' ) );

//
//	schema = {
//		$path: String,
//		$get: $create: $update: $del: { handler: Function, key: Array, keyDepth: Number },
//		$isContainer: Boolean or missing,
//		$: or <name>: Schema
//	}
//

exports = module.exports = function( schema ) {
	return d.hitch( new Service( schema ), 'execute' );
}

function getGroups( regex_result ) {
	return regex_result.slice( 1 ).filter( function(s){ return typeof s !== 'undefined'; } );
}

function keyOf( obj, except ) {
	return function( key ) {
		return key !== except && obj[key];
	}
}

function matches( regex ) {
	return function( str ) {
		return regex.test( str );
	}
}

function expandPath( rel, key, fill ) {
	var i=0;
	return rel.replace( /\$/g, function() {
		if( i<key.length )	return key[i++];
		else return fill || '*';
	} );
}

function pathKeyLength( rel ) {
	var n=0;
	rel.replace( /\$/g, function() { ++n; } );
	return n;
}

var Service = d.extend(
	function( schema ) {
		this.keyRegex = '^';
		this.pathRegex = '^';
		this.handlers = {};
		this.compile( schema, false )
		this.keyRegex = new RegExp( this.keyRegex + '$' );
		this.pathRegex = new RegExp( this.pathRegex + '$' );
	}, {
		execute: function( ctx, method ) {

			if( !method )	method = ctx.request.method;

			var key = this.keyRegex.exec( ctx.request.url ),
				path = this.pathRegex.exec( ctx.request.url );
			if( !key || !path )
				return d.mixin(
					new Error( 'Relative URL "' + ctx.request.url + '" does not refer to a schema element' ),
					{ httpCode: 404 }
				);

			key = getGroups( key );
			path = getGroups( path ).join( '/' ).replace( /\/(?=\/|$)/g, '/$$' );

			var handler = this.handlers[path];
			if( !handler ) return new Error( 'BUG - handler for "' + ctx.request.url + '" not found' );

			if( !handler[method] )	return d.mixin(
				new Error( method + ' is not supported by "' + ctx.request.url + '"' ), 
				{ 
					httpCode: 405, 
					httpHeaders: { 'Allow': handler.allowVerbs() }
				}
			);
			
			try {
				return handler[method]( ctx, key );
			} catch( e ) {
				if( e.httpCode == 405 && !(e.httpHeaders||{}).Allow )
					(e.httpHeaders||(e.httpHeaders={})).Allow = handler.allowVerbs( method );
				return e;
			}
		},

		compile: function( schema, is_item ) {

			var rel = schema.$path;

			this.handlers[rel] = new Handler( schema, is_item );

			if( schema.$isContainer ) {
				this.keyRegex += '(?:' + ( rel && '\\/' ) + '([^/]+)';
				this.pathRegex += '(?:' + ( rel && '\\/' ) + '[^/]+()';
				/* this.handlers[rel].children = [ */ this.compile( schema.$, true ); // ];
			} else {
				var first = true;
				for( var i in schema )
					if( i.charAt(0) != '$' ) {
						if( first ) {
							this.keyRegex += '(?:';
							this.pathRegex += '(?:';
//							this.handlers[rel].children = [];
						} else {
							this.keyRegex += '|';
							this.pathRegex += '|';
						}
						this.keyRegex += ( rel && '\\/' ) + i;
						this.pathRegex += ( rel && '\\/' ) + '(' + i + ')';
//						this.handlers[rel].children.push( 
							this.compile( schema[i], false );
//						);
						first = false;
					}
				if( first )	return; // this.handlers[rel];
			}
			this.keyRegex += ')?';
			this.pathRegex += ')?';

//			return this.handlers[rel];
		}
	}
);

var Handler = d.extend(
	function( schema, is_item ) {
		var	mc = new MethodCompiler( schema, is_item );

		if( !(this.get = mc.get()) )	
			this.GET = null;

		if( !is_item || !(this.del = mc.del()) )
			this.DELETE = null;

		if( !schema.$isContainer || !(this.create = mc.modify( true )) )	
			this.POST = null;

		if( !(this.update = mc.modify()) )
			this.PUT = null;
	}, {
		allowVerbs: function( forbidden ) {
			return [ 'GET', 'POST', 'PUT', 'DELETE' ].filter( keyOf(this,forbidden) );
		},

		GET: function( ctx, key ) {
			var depth = ctx.request.arg( 'depth' );
			if( Number(depth) === NaN )	ctx.response.fail( 400, 'Query argument depth=' + depth + ' is not a number' );
			if( depth !== null )	depth = Number(depth);
			return this.get( ctx, key, depth );
		},

		POST: function( ctx, key ) {
			ctx._keyMap = makeKeyMap();
			return this.create( ctx, key );
		},

		PUT: function( ctx, key ) {
			ctx._keyMap = makeKeyMap();
			return this.update( ctx, key );
		},

		DELETE: function( ctx, key ) {
			var obj = ctx.request.get( ctx.request.url, { version: null } );
			if( obj )	obj._['delete'] = true;
			return this.del( ctx, key );
		},

		// Default implementations

		update: function( ctx, key ) {	// PUT/POST on container
			
		},

		del: function( ctx, key ) { // Missing deletion on item during PUT on container
			ctx.response.fail( 405, 'Item at "' + expandPath( this.path, key ) + '" does not a have a del() method associated' );
		}
	}
);

var MethodCompiler = d.extend(
	function( schema, is_item ) {
		this.schema = schema;
		this.isItem = is_item;
		this.keyLength = pathKeyLength( schema.$path );
	}, {
		get: function() {

			if( require.main.debug )
				console.log( 'get: ' + this.schema.$path );

			function collect( schema, min_keylen, max_keylen, depth ) {
				var acceptable = schema.$get && schema.$get.filter( function(h) {
						return h.key.length >= min_keylen && h.key.length <= max_keylen;
					} ).sort( byShortestKey )[0];

				if( acceptable && !acceptable.handler )	return [];

				var	depth_incr = depthIncrement( acceptable, schema ),
					result = enumSchemaChildren( schema, depth_incr )
						.map( function( sub ) {
							return collect( 
								sub, min_keylen, 
								Math.max( 
									max_keylen, 
									acceptable ? 
										acceptable.fullKeyLength() + collectKeyDepth( schema, acceptable.depth )
										: 0 
								), 
								depth + depth_incr 
							);
						} )
						.reduce( concatAll, [] );

				if( acceptable ) result.push(
					d.mixin( acceptable.key.length == min_keylen ?
						[ acceptable.handler, ".call( ctx, new Key('", schema.$path, "',", stringList(acceptable.key), ",key) )" ] :
						[ "d.allOrNone(",
							"enumKeys('", schema.$path, "',", stringList(acceptable.key), ",ctx.response,key)",
								".map( d.hitch(ctx,", acceptable.handler, ")))" ],
						{ depth: depth, keyLength: acceptable.key.length }
					)
				);				
					
				return result;
			}

			var invocations = collect( this.schema, this.keyLength, this.keyLength, 0 )
					.sort( function( a, b ) { return a.keyLength - b.keyLength; } );

			if( invocations.length == 0 )	return null; // Do not provide GET

			return makeClosure(
				[ 
					"function(ctx,key,depth){",
						"return "
				].concat(
					group( 
						invocations,
						function( a, b ) { return a.keyLength == b.keyLength; },
						function( g ) {
							var result = g.length>1 ? [ "d.allOrNone([" ] : [];
							g.forEach( function( expr, i ) {
								if( i )	result.push( ',' );
								if( g[0].depth > 0 )
									result = result.concat( "(depth===null||depth>=", g[0].depth, ")&&" );
								result = result.concat( expr );
							} );
							if( g.length>1 )	result.push( "])" );
							return result;
						}
					).reduce( function( prev, curr ) {
						return [ "d.when(" ].concat( 
							prev, ",function(){return ", curr, ";})"
						);
					} ),
					";}"
				)
			);
		},

		modify: function( is_create ) {

			if( require.main.debug )
				console.log( 'modify(' + (is_create&&'true'||'false') + '): ' + this.schema.$path );

			var init_key_length = this.keyLength;
			
			function collect_create( schema, keylen, is_item ) {

				var acceptable = schema.$create && schema.$create.filter( function( h ) {
						return h.key.length <= keylen && (!is_item || h.placeholders.length > 0);
					} ).sort( byShortestKey )[0],
					result = enumSchemaChildren( schema, depthIncrement( acceptable, schema ) )
						.map( function( sub ) {
							return collect_create( 
								sub, 
								acceptable ? 
									acceptable.fullKeyLength() + collectKeyDepth( schema, acceptable.depth ) 
									: keylen,
								schema.$isContainer
							);
						} );
				
				if( !acceptable && result.some( function( c ) {
						return c.length == 0 || c.fullKeyLength < keylen;
					} )
				)	return [];

				result = result.reduce( function( acc, array ) {
						return array.length ? d.mixin( acc.concat( array ), { fullKeyLength: Math.max( acc.fullKeyLength, array.fullKeyLength ) } ) : acc;
					},
					d.mixin( [], { fullKeyLength: acceptable && acceptable.fullKeyLength() || 0 } )
				);

				if( acceptable )
					result.push( {
						op: 'create',
						handler: acceptable,
						schema: schema
					} );

				return result;
			}

			function collect_update( schema ) {

				var acceptable = schema.$update && schema.$update.sort( byShortestKey )[0],
					result = [];

				if( schema.$isContainer ) {
					if( !acceptable ) result = enumSchemaChildren( schema, 1 )
						.map( function( sub ) {
							return	collect_create( sub, pathKeyLength( schema.$path ), true )
								.concat( 
									collect_update( sub )
								).concat(
									collect_delete( sub )
								);
						} );
				} else
					result = enumSchemaChildren( schema, depthIncrement( acceptable, schema ) )
						.map( function( sub ) {
							return collect_update( sub );
						} );

				result = result.reduce( concatAll, [] );

				if( acceptable )
					result.push( {
						op: 'update',
						handler: acceptable,
						schema: schema
					} );

				return result;
			}

			function collect_delete( schema ) {
				return schema.$del ?
					[ {
						op: 'del',
						handler: schema.$del.sort( byShortestKey )[0],
						schema: schema
					} ]
				:	[];
			}
		
			function byShortestKeyAndPath(a,b) {
				return (a.handler.key.length - b.handler.key.length) ||
					   a.schema.$path.localeCompare( b.schema.$path );
			}

			var invocations = group(
				( is_create ? 
					collect_create( this.schema, this.keyLength, this.isItem ) :
					collect_update( this.schema )
				).sort( byShortestKeyAndPath ),
				function(a,b) { return !byShortestKeyAndPath(a,b); },
				function(g) {
					g.slice(1).forEach( function(v) {
						var pv = pattern( g[0].schema.$path, v.handler ),
							pg = pattern( g[0].schema.$path, g[0].handler );
						if( pv != pg )
							throw Error( 'Limitation: ' + pv + ' and ' + pg + ' cannot have different placeholder names' );
					} );

					var item_class = extendClass( Item, { 
						key_names: g[0].handler.placeholders,
						isContainer: g[0].schema.$isContainer,
						children: namedChildren( g[0].schema )
					} );

					var handlers = {};
					g.forEach( function(v){ handlers[v.op] = v.handler.handler; } );

					return d.mixin(
						g[0].handler.key.length > init_key_length ?
							[   
								"enumKeys('", g[0].schema.$path, "',", stringList(g[0].handler.key),
									", ctx.request, key )",
								".map( d.hitch( ctx, callWithItems, ", handlers, ", ",
									item_class, ", [] ))",
								".reduce( concatAll, [] )" 
							] :
							[ 	
								"callWithItems.call( ctx, ", handlers, ", ", item_class, ", "
							].concat( 
									g[0].handler.key.length == 0 ? "key"
									: g[0].handler.key.length == init_key_length ? "[]"
									: [ "key.slice(", g[0].handler.key.length, ")" ],
									",new Key('", g[0].schema.$path, "',", stringList(g[0].handler.key), 
									g[0].handler.key.length == init_key_length ? ",key"
									: g[0].handler.key.length == 0 ? ",[]"
									: [ ",key.slice(0,", g[0].handler.key.length, ")" ],
									"))"
							)
						,
						{ keyLength: g[0].handler.key.length }
					);
				} 
			);
			
			if( invocations.length == 0 )	return null;
			
			return makeClosure(
				[ 
					"function(ctx,key){",
						"return "
				].concat(
					group( 
						invocations,
						function( a, b ) { return a.keyLength == b.keyLength; },
						function( g ) {
							var result = [ "d.allOrNone(" ].concat( g[0] );
							if( g.length>1 ) 
								result = result.concat(
									".concat(",
									g.slice(1).reduce( function( acc, array ) {
										return acc.concat( ",", array );
									} ),
									")"
								);
							result.push( ")" );
							return result;
						}
					).reduce( function( prev, curr ) {
						return [ "d.when(" ].concat( 
							prev, ",function(){return ", curr, ";})"
						);
					} ),
					";}"
				)
			);
		},

		del: function() {
			if( require.main.debug )
				console.log( 'del: ' + this.schema.$path );

			var acceptable = this.schema.$del && this.schema.$del.filter( function(h) {
				return h.key.length <= this.keyLength;
			}, this ).sort( function(a,b) {
				return b.key.length - a.key.length; // Pick the longest available key
			} )[0];

			if( !acceptable )	return null; // Do not provide DELETE

			var	item_class = extendClass( Item, { key_names: acceptable.placeholders } );

			return makeClosure(
				[ 
					"function(ctx,key){",
						"var k=new Key('", 	
								this.schema.$path, "',", stringList(acceptable.key), 
							",key);",
						"return ", acceptable.handler, ".call( ctx, k, "
				].concat(
						acceptable.key.length == this.keyLength ? "" : "[",
							[ "new ", item_class, "(k._url, key.slice(", acceptable.key.length, 
							  "), ctx.request.get(k.url())||null)" ],
						acceptable.key.length == this.keyLength ? "" : "]",
						");",
					"}"
				)
			);
		}
	}
);

function concatAll(acc, array) { 
	return acc.concat( array ); 
}

function pattern( path, desc ) {
	return expandPath(
		path,
		desc.key.map( function(s){ return ':'+s; } )
			.concat( desc.placeholders.map( function(s){ return '*'+s; } ) )
	);
}

function byShortestKey(a,b) {
	return a.key.length - b.key.length;
}

function namedChildren( schema ) {
	var result = {};
	for( var c in schema )
		if( schema.hasOwnProperty(c) && c.charAt(0) != '$' )
			result[c] = true;
	return result;
}

function mapEachNamedChild( schema, body ) {
	var result = [];
	for( var c in schema )
		if( schema.hasOwnProperty(c) && c.charAt(0) != '$' )
			result.push( body( schema[c] ) );
	return result;
}

function depthIncrement( desc, schema ) {
	return 1 + ( desc ? 'depth' in desc ? desc.depth : schema.$isContainer&&1||0 : 0 );
}

function collectKeyDepth( schema, depth ) {

	var result = 0;
	while( schema && schema.$isContainer ) {
		++result;
		schema = schema.$;
		if( depth )	--depth;
		else return result;
	}

	if( schema && depth )
		return result +
			mapEachNamedChild( schema, function(c){ return collectKeyDepth( c, depth-1 ); } )
			.reduce( Math.min );
	else 
		return result;	
}

function enumSchemaChildren( schema, at_depth ) {

	while( schema && schema.$isContainer && at_depth ) {
		schema = schema.$;
		--at_depth;
	}
	if( at_depth == 0 )	return [ schema ];
	
	return mapEachNamedChild( schema, function(c){ return enumSchemaChildren( c, at_depth-1 ); } )
		.reduce( function(a,b){ return a.concat(b); }, [] );
}

function group( what, by, body ) {
	if( what.length == 0 ) return [];
	var result = [];
	for( var curr=1, last=0; curr<what.length; ++curr )
		if( !by( what[curr-1], what[curr] ) ) {
			result.push( body( what.slice( last, curr ) ) );
			last = curr;
		}
	if( curr > last )
		result.push( body( what.slice( last, curr ) ) );

	return result;
}

function evalInModule() {
	if( require.main.debug )
		console.log( arguments[0] );
	return eval( '(' + arguments[0] + ')' );
}

function makeClosure( src ) {
	var	args = [];
	src = src.map( function( t ) {
		if( typeof t in { 'function': 1, 'object': 1 } ) {
			args.push( t );
			return '$' + args.length;
		} else return t.toString();
	} ).join('');

	return evalInModule( 
		'function(' + args.map( function(_,i){ return '$'+(i+1); } ).join(',') + 
		'){return ' + src + ';}' 
	).apply( null, args );
}

function stringList( names ) {
	return '[' + ( names.length ? '"' : '' ) + names.join( '","' ) + ( names.length ? '"' : '' ) + ']';
}

function wildCardUrl( path, key, wc_count ) {
	var	wc = expandPath( path, key ).split( '/*' );
	return wc_count && wc.length > 1 ?
		wc.slice( 0, wc_count ).join( '/*' ) + '/*' 
	:	wc.join( '/*' );
}

var Key = d.extend(
	function( path, key_names, key ) {
		this._url = expandPath( path, key, '$' );
		key_names.forEach( function( n,i ){ this[n]=key[i]; }, this );
	}, {
		url: function( /*...*/ ) {
			return expandPath( this._url, arguments ).split( '/*' )[0];
		}
	}
);

function enumKeys( path, key_names, pkt, key ) {
	var result = [];
	packet.forEach( 
		pkt.body, wildCardUrl( path, key, key_names.length - key.length ),
		function( key_suffix ) {
			result.push( new Key( path, key_names, key.concat( key_suffix ) ) );
		}
	);
	return result;
}

function extendClass( cls, proto ) {
	return d.extend(
		function() { cls.apply( this, arguments ); },
		d.delegate( cls.prototype, proto )
	);
}

var Item = d.extend(
	function( path, key, data ) {
		this._url = path;
		this._key = key;
		this._data = data;
		this._setProps();
	}, {
		data: function() { return this._data; },

		copy: function() {
			if( !this._data )	return this._data;
			var result = {};

			if( !this.isContainer )
				for( var i in this._data )	
					if( i.charAt(0) != '_' && this._data.hasOwnProperty(i) && !(i in this.children) )
						result[i] = this._data[i];

			if( this._data._ ) {
				result._ = {};
				for( var i in this._data._ )
					if( this._data._.hasOwnProperty(i) )
						result._[i] = this._data._[i] && typeof this._data._[i] === 'object' ?
							d.mixin( {}, this._data._[i] ) : this._data._[i];
			}

			if( this._key[this._key.length-1].toString().charAt(0) == '@' )	
				( result._|| (result._ = {}) ).replaces = this._key[this._key.length-1];

			return result;
		},

		url:  function( /*...*/ ) { 
			return expandPath( 
				this._url,
				arguments.length ? this._key.slice( 0, this._key.length - arguments.length ).concat( d._toArray( arguments ) ) : this._key
			);
		},

		_setProps: function() {
			this.key_names.forEach( function( n,i ){ this[n]=this._key[i]; }, this );
		}
	}
);

function enumItems( Item, path, pkt, key ) {
	var result = [],
		fixed_part = pathKeyLength( path ) - Item.prototype.key_names.length,
		pfx = expandPath( path, key.slice( 0, fixed_part ), '$' );

	key = key.slice( fixed_part );

	packet.forEach(
		pkt.body, wildCardUrl( path, key, Item.prototype.key_names.length ),
		function( key_suffix, obj ) {
			result.push( new Item( pfx, key.concat( key_suffix ), obj ) );
		}
	);
	return result; 
}

function makeKeyMap() {
	var	km = {};
	function get( key ) {
		return km[key]||key;
	}

	get.set = function( key, value ) {
		if( key in km ) throw Error( 'Attempt to re-bind key "' + key + '" from "' + km[key] + '" to "' + value + '"' );
		km[key] = value;
	}

	return get;
}

function mapKey( map_fn, item ) {
	item._url = item._url.replace( /@[^/]+/g, map_fn );
	item._key = item._key.map( map_fn );
	item._setProps();
} 

function /*ctx.*/ callWithItems( handlers, Item, key_suffix, k /* : Key */ ) {

	var	create_only = k._url.indexOf( '@' ) >= 0;
	if( create_only && !handlers.create )	return [];

	var create_items = create_only ? enumItems( Item, k._url, this.request, key_suffix ) : [],
		update_items = [],
		del_items = [],
		result = [],
		ctx = this;

	if( !create_only )
		enumItems( Item, k._url, this.request, key_suffix )
			.forEach( function(item) {
				if( item._key.some( function(s){ return s.charAt(0) == '@'; } ) ) {
					mapKey( ctx._keyMap, item );
					create_items.push( item );
				} else if( !item._data || item._data._ && item._data._["delete"] )
					del_items.push( item );
				else
					update_items.push( item );
			} );
	else {
		k._url = k._url.replace( /@[^/]+/g, this._keyMap );
		create_items.forEach( d.hitch( null, mapKey, this._keyMap ) );
	}

	function process( items, op ) {
		if( items.length )
			if( handlers[op] )
				if( Item.prototype.key_names.length )
					result.push( handlers[op].call( ctx, k, items ) );
				else
					result.splice( result.length, 0, items.map( d.hitch( ctx, handlers[op], k ) ) );
//			else
//				ctx.response.fail( 405, op + '() method is not defined for "' + k.url() + '"' );
	}

	process( create_items, 'create' );
	process( update_items, 'update' );
	process( del_items, 'del' );

	if( create_items.length )
		result[0] = d.when( result[0], collectKeyBindings );
	
	function collectKeyBindings( pass ) {
		packet.forEach( 
			ctx.response.body, 
			expandPath( k._url,	key_suffix.map( ctx._keyMap ) ),
			function( key, obj ) { 
				var	replaces = obj && obj._ && obj._.replaces;
				if( replaces && ctx._keyMap( replaces ) == replaces )
					ctx._keyMap.set( replaces, key[key.length-1] );
			}, 
			true
		);
		return pass;
	}

	return result;
}


