// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var d = require( './lang.js' );

d.mixin( d, require( 'node-promise' ) );

exports = module.exports = function( ctx_cons, configure ) {
	var svc = new ServiceWrapper( ctx_cons );
	if( configure )	
		configure( svc );
	else if( ctx_cons.prototype.configure )
		ctx_cons.prototype.configure( svc );
	else
		ctx_cons().configure( svc );

	return svc.service( ctx_cons );
}

function defined() {
	for( var i=0; i<arguments.length; ++i )
		if( typeof arguments[i] !== 'undefined' )
			return arguments[i];
}

function when( what, ok, err ) {
	return what instanceof Error ?
		err( what ) : d.when( what, ok, err );
}

var Request = require( './request.js' ),
	Response = require( './response.js' ),
	buildService = require( './build-service.js' );

var ServiceWrapper = d.extend(
	function() {
		this.schema = { $path: "" };
	}, {

		get: function( url, handler, depth ) {
			this.register( '$get', url, handler, defined( depth, (handler||undefined) && handler.depth ) );
			return this;
		},

		create: function( url, handler, depth ) {
			this.register( '$create', url, handler, defined( depth, (handler||undefined) && handler.depth ) );
			return this;
		},

		update: function( url, handler, depth ) {
			this.register( '$update', url, handler, defined( depth, (handler||undefined) && handler.depth ) );
			return this;
		},

		del: function( url, handler ) {
			this.register( '$del', url, handler );
			return this;
		},
	
		register: function( op, url, handler, depth ) {
			url = url.split( '/' );
			var s = this.schema;
			if( url[0] ) url.forEach( function( u, i ) {

				function path() {
					return url.slice(0,i+1).map( function(u){ 
						return isPlaceholder(u) ? '$' : u;
					} ).join( '/' );
				}

				if( isPlaceholder(u) ) {
					if( s.$isContainer === false /* Sic! */ )
						throw Error( 'Placeholder "' + u + '" does not correspond to a contained item in ' + url.join('/') );
					s.$isContainer = true;
					s = s.$ || (s.$={ $path: path() });
				} else {
					if( s.$isContainer )
						throw Error( 'Expected placeholder instead of "' + u + ' in ' + url.join('/') );
					s.$isContainer = false;
					s = s[u] || (s[u]={ $path: path() });
				}
			} );
			(s[op]||(s[op]=[]))
				.push( new HandlerDescriptor( 
					url.filter( isPlaceholder ), 
					handler, depth, op
				));
		},

		service: function( ctx_cons ) {
			var svc = buildService( this.schema );

			function wrap( req, resp, http_req ) {
				var ctx = new ctx_cons( http_req );
				ctx.request = req;
				ctx.response = resp;

				function setError( e ) {
					resp.setError( e );
					return false;
				}

				function doNothing() { return false; }

				if( req.method !== 'GET' ) {
					if( ctx.begin )	ctx.begin();
					return when( 
						svc( ctx ),
						function() {
							if( ctx.commit )	ctx.commit();
							return false;
						},
						function( e ) {
							if( ctx.rollback )	ctx.rollback();
							resp.setError( e );
							return e.httpCode === 409 ?
								when( svc( ctx, 'GET' ), doNothing, setError ) :
								false;
						}
					);
				} else 	
					return when( svc( ctx ), doNothing, setError );
			}

			return function( req, resp ) {
				var request = new Request(),
					response = new Response();

				d.when(
					request.receive( req ),
					function() {
						return d.when( 
							wrap( request, response, req ), 
							done, done
						);
					},
					function( err ) {
						response.setError( err );
						return done();
					}
				);

				function done() {
					response.send( resp );
					return false;
				}
			}
		}
	} 
);

function isPlaceholder(u) {
	return u && '*:'.indexOf( u.charAt(0) ) >= 0;
}

var HandlerDescriptor = d.extend(
	function( placeholders, handler, depth, op ) {
		this.handler = handler;
		if( typeof depth !== 'undefined' )	this.depth = depth;
		this.key = 
			filterWhile(
				placeholders,
				function( p ){ return p.charAt(0)==':'; }
			).map(
				function( p ){ return p.substr(1); }
			);

		placeholders = placeholders.slice( this.key.length ).map( function(p) {
			if( p.charAt(0) ==':' )	
				throw Error( '* should not precede : in a URL pattern' );
			if( op === '$get' ? p != '*' : p == '*' )
				throw Error( '"' + p + '" should not be used in a call to ' + op.substr(1) + '()' );
			return p.substr( 1 );
		} );

		if( op !== '$get' )	this.placeholders = placeholders;
		else				this.keyDepth = placeholders.length;
	}, {
		fullKeyLength: function() {
			return this.key.length + ( this.placeholders ? this.placeholders.length : this.keyDepth );
		}
	}
);

function filterWhile( what, pred ) {
	var result = [];
	for( var i=0; i < what.length; ++i )
		if( !pred(what[i]) )	break;
		else result.push( what[i] );
	return result;
}

