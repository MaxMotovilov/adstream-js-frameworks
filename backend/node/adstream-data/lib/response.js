// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var d = require( './lang.js' ),
	connect = require( 'connect' ),
	packet = require( './packet.js' );

exports = module.exports = d.extend(
	function() {
		this.body = {};
	}, {
		send: function( resp ) {
			if( this.error )
				this.body._error = d.mixin(
					this.body._error || {},
					{ message: this.error.message },
					this.error.content ? { content: this.error.content } : {},
					this.error.stack ? { backtrace: this.error.stack.split( /\n\s*/ ).slice(1) } : {}
				);
	
			resp.writeHead(
				this.error ? this.error.httpCode || 500 : 200,
				d.mixin( 
					{ 'Content-Type': 'application/json; charset=utf-8' },
					( this.error && this.error.httpHeaders ) || {}
				)
			);

			resp.end( JSON.stringify( this.body ) );
		},

		setError: function( err ) {
			if( err ) {
				this.reset();
				this.error = err;
			} else delete this.error;
		},		

		reset: function() {
			this.body = {};
		},

		_fail: function( code, msg, headers ) {
			if (msg && typeof msg === "object") {
				return d.mixin( new Error( msg.message ), { content: msg }, { httpCode: code }, headers ? { httpHeaders: headers } : {} );
			} else {
				return d.mixin( new Error( errorMessage ), { httpCode: code }, headers ? { httpHeaders: headers } : {} );
			}
		},

		fail: function( a, b, c, d ) {
			if( a.reject )	a.reject( this._fail( b, c, d ) );
			else			throw this._fail( a, b, c );
		},

		set: function( rel, val, meta ) {	
			var result;
			if( !val )
				packet.setNull( this.body, rel );
			else {
				result = d.mixin( this.get( rel ), val );
				if( meta )	result._ = d.mixin( result._ || {}, meta );
			}
			return result;
		},

		get: function( rel ) {
			return packet.get( this.body, rel, true );
		}
	}
);
