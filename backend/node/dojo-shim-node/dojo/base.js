// Copyright (c) 2016 12 Quarters Consulting
// Copyright (c) 2005-2012, The Dojo Foundation
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var mixOne = require( "heya-utils/mixin" ),
	promise = require( "node-promise" ),
	dcl = require( "dcl" );

require( "dcl/inherited" );

dojo.provide = function( module_id ) {
	var namespace = dojo.global;
	module_id.replace( /\w+/g, function( w ) {
		namespace = w in namespace ? namespace[w] : (namespace[w] = {});
		return "";
	} );
}

dojo.filter = function( list, fn, self ) {
	return list.filter( fn, self );
}

dojo.map = function( list, fn, self ) {
	return list.map( fn, self );
}

dojo.some = function( list, fn, self ) {
	return list.some( fn, self );
}

dojo.forEach = function( list, fn, self ) {
	list.forEach( fn, self );
}

dojo.delegate = function( proto, props ) {
	var v = Object.create( proto );
	return props ? mixOne( v, props ) : v;
}

dojo.hitch = function( self, method /*, ... */ ) {
	if( typeof method !== 'function' )
		method = self[method];

	var args = Array.prototype.slice.call( arguments, 2 );
	args.unshift( self );
	
	return Function.bind.apply( method, args );
}

dojo.mixin = function( first /*, ... */ ) {
	return Array.prototype.slice.call( arguments, 1 )
				.reduce( mixOne, first );
}

dojo.toJson = function( x ) {
	return JSON.stringify(x);
}

dojo.Deferred = promise.Deferred;

dojo.when = promise.when;

dojo.objectToQuery = function( obj ) {
	return Object.keys( obj )
				 .reduce( function( result, key ) {
					var pfx = encodeURIComponent( key ) + "=";

					if( obj[key] instanceof Array )
						obj[key].forEach( save );
					else
						save( obj[key] );

					return result;

					function save( v ) { 
						result.push( pfx + encodeURIComponent( v ) ) 
					}
				  }, [] ).join( "&" );
}

dojo.getObject = function( path, create, where ) {
	where = where || dojo.global;

	path.replace( /(\w+)(\W+)?/g, function( _, key, more ) {
		where = where != null
			? ( key in where
				? where[key]
				: create 
					? (where[key] = more ? {} : false) 
					: undefined 
			  )
			: undefined;
		return "";
	} );

	return where;
}

dojo.setObject = function( path, value, where ) {
	where = where || dojo.global;

	path.replace( /(\w+)(\W+)?/g, function( _, key, more ) {
		where = more && key in where
				? where[key]
				: (where[key] = more ? {} : value) 
		return "";
	} );
}

dojo.replace = function( tmpl, map, pattern ) {
	return tmpl.replace( 
			pattern || /\{([^\}]+)\}/g, 
			typeof map === 'function' ?
				map : function(_, k){ 
					return dojo.getObject( k, false, map ); 
		   		} 
	);
}

dojo.declare = function( class_name, bases, proto ) {

	var chains, clazz;

	if( typeof class_name !== 'string' ) {
		proto = bases;
		bases = class_name;
		class_name = undefined;
	}

	if( proto ) {
		chains = proto[ "-chains-" ];
		delete proto[ "-chains-" ];
	}

	if( chains )
		Object.keys( chains )
			  .forEach( function( method ) {
				var method_def;
				if( chains[method] == "manual" ) {
					method_def = proto[method];
					proto[method] = dcl.superCall( function(sup) {
						return method_def;
					} );
					delete chains[method];
				}
			  } );

	clazz = dcl( bases, proto );
	
	if( chains ) 
		Object.keys( chains )
			  .forEach( function( method ) {
				chain( method, chains[method] );
			  } );

	if( class_name )
		dojo.setObject( class_name, clazz );

	return clazz;

	function chain( what, how ) {
		dcl[ "chain" + how.substr( 0, 1 ).toUpperCase() + how.substr( 1 ) ]
			.call( dcl, clazz, what );
	}
}


