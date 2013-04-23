// Copyright (C) 2010-2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var d = require( './lang.js' ),
	connect = require( 'connect' ),
	packet = require( './packet.js' );
d.mixin( d, require( 'node-promise' ) );

exports = module.exports = d.extend(
	function() {}, 
	{
		receive: function( req ) {

			var u = require( 'url' ).parse( req.url, true );
			this.method = req.method;
			this.url = u.pathname.substring( 1 );
			this.args = d.mixin( {}, this.origArgs = u.query );

			req.setEncoding( 'utf8' );

			var res = new d.Deferred(),
				data = [];
			req.on( 'data', function(chunk){ data.push( chunk ); } );
			req.on( 'end', d.hitch( this, function() {
				this.build( res, req, data.join('') );
			} ) );
			return res;
		},

		build: function( res, req, body ) {

			if( body &&(req.headers['content-type'] || '').split( /\s*;\s*/ )[0] !== 'application/json' )
				res.reject( d.mixin( 
					new Error( 'Invalid content type in HTTP request, expected application/json' ),
					{ httpCode: 400 }
				) );
			else try { 
				this.body = body && JSON.parse( body ) || {};
				this.headers = req.headers;
				res.resolve( false );
			} catch( e ) {
				res.reject( d.mixin(
					new Error( 'Malformed request body: ' + e.message ),
					{ httpCode: 400 }
				) );
			}
		},

		get: function( rel, meta ) {
			if( meta )	meta = collectMeta( meta, this.args, rel.replace( /.*[\/]/, '' ) );
			var res = packet.get( this.body, rel, meta );
			if( meta )
				if( res._ )	d.mixin( res._, mixinChildren( meta, res._ ) );
				else		res._ = meta;
			return res;
		},

		arg: function( arg_name ) {
			var result = null;
			if( arg_name in this.args ) {
				result = this.args[arg_name];
				delete this.args[arg_name];
			}
			return result;
		}
	}
);

function mixinChildren( to, from ) {
	for( var f in from )
		if( f in to )
			if( typeof from[f] === 'object' && typeof to[f] === 'object' )
				d.mixin( to[f], from[f] );
			else to[f] = from[f];
}

function collectMeta( tpl, args, id ) {
	var sub, res;

	function result() {
		if( !res )	res = {};
		return res;
	}

	function arg( f ) {
		var q = id + '.' + f;
		if( q in args )
			f = q;

		var r = args[f];
		if( f in args )	delete args[f];
		return r;
	}

	for( var f in tpl )
		if( tpl.hasOwnProperty(f) )
			switch( typeof tpl[f] ) {
				case 'undefined':
				case 'object':
					if( tpl[f] ) {
						if( sub = collectMeta( tpl[f], args ) )
							result()[f] = sub;
					} else if( f in args ) {
						result()[f] = arg( f );
					}
					break;
				case 'string':
					result()[f] = f in args ? arg( f ) : tpl[f];
					break;
				case 'number':
					if( f in args ) {
						if( Number.isNaN( sub = Number( arg( f ) ) ) )						
							throw d.mixin(
								new Error( 'Query argument ' + f + '=' + args[f] + ' is not a number' ),
								{ httpCode: 400 }
							);
					} else sub = tpl[f];

					if( !Number.isNaN( sub ) )	result()[f] = sub;
					break;
				case 'boolean':
					if( f in args )
						result()[f] = !( arg( f ).toLowerCase() in { '': 1, '0': 1, 'false': 1, 'no': 1, 'n': 1 } );
					else
						result()[f] = tpl[f];
					break;
				case 'function':
					if( typeof (sub = tpl[f]( arg( f ) )) !== 'undefined' )
						result()[f] = sub;
					break;
			}

	return res;
}

