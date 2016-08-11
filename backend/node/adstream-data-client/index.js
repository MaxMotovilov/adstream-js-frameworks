// Copyright (c) 2016 12 Quarters Consulting
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var dojo = require( "dojo-shim-node" );

dojo.registerPrefix( "adstream.data", module );
dojo.require( "adstream.data.Service" );
dojo.require( "adstream.data.schema" );

exports = module.exports = Object.create( dojo.global.adstream.data );

dojo.xhr = function() {
	throw Error( "Call setHttpProvider() to use adstream-data-client!" );
}

dojo.publish = dojo.publish || function() {}

exports.setHttpProvider = function( send_http_request ) {
	dojo.xhr = function( method, params ) {

		method = method.toLowerCase();

		var ioargs = { xhr: { 
				getAllResponseHeaders: getHeaders,
				readyState: 0
			} },
			data = params[ method + "Data" ];

		return send_http_request( 
					method, 
					params.url + ( data || !params.content ? "" : "?" + dojo.objectToQuery( params.content ) ),
					params.headers,
					data 
			   ).then( success, failure );

		function success( response ) {
			ioargs.xhr.readyState = 4;
			ioargs.xhr.status = 200;
			params.handle( typeof response === 'string' ? response : JSON.stringify(response), ioargs );
		}

		function failure( error ) {
			if( error.status ) {
				ioargs.xhr.status = status;
				ioargs.xhr.responseText = error.message;
			} else if( !error.responseText ) {
				error.responseText = error.message;
			}
			params.handle( error, ioargs );
		}
	}
}

function getHeaders() {
	return "Content-Type: application/json\n"
}

