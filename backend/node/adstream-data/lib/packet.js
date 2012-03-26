// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var d = require( './lang.js' );

exports.get = function( body, rel, create ) {
	rel = rel.split( '/' );
	var obj, pfx = '', last = 0;

	rel.forEach( function( u, i ) {
		if( obj && !last ) {
			if( u in obj )	obj = obj[u];
			else last = i;
		} else if( !obj ) {
			pfx = pfx ? pfx + '/' + u : u;
			obj = body[pfx];
		}
	}, this );

	if( create && typeof create !== 'function' ) {
		create = function( obj, last ) {
			if( !obj )	body[ rel.join('/') ] = obj = mergeDescendants( rel.join('/'), body );
			if( last > 0 )	rel.slice( last ).forEach( function(u){
				obj = obj[u] = {};
			} );
			return obj;
		};
	}

	return create ? create( obj, last ) : last > 0 ? undefined : obj;
};

exports.setNull = function( body, rel ) {
	return exports.get( body, rel, function( obj, last ) {
		if( !obj || last == 0 )	{
			if( !obj )	mergeDescendants( rel, body );
			body[rel] = null;
		} else {
			rel = rel.split('/');
			rel.slice( last ).forEach( function(u,i){
				obj = obj[u] = i+last==rel.length-1 ? null : {};
			} );
		}
	} );
}

exports.forEach = function( body, rel, cb /* ( subkey, obj ) */, with_interm ) {
	
	var	pfx = rel.split( '/*' )[0],
		obj = pfx && exports.get( body, pfx );

	if( pfx == rel ) {
		if( typeof obj !== 'undefined' )	
			cb( [], obj );
		return;
	}

	var parts = rel.substr( pfx.length + 1 ).split( '/' ),
		sub = [];

	if( obj )	
		wide( obj, 1 );
	else {
		var m,
			pat = new RegExp(
				'^' + pfx.replace( '/', '\\/' ) +
				rel.substr( pfx.length ).split('/')
					.map( function(u,i) {
						return u == '*' ? '([^/]+)' : u;
					} )
					.reduceRight( function(a,b){ 
						return '(?:\\/' + b + a + ')?';
					} ) +
				'$'
			);
	
		for( var path in body )
			if( body.hasOwnProperty(path) && (m = pat.exec(path)) ) {
				sub = m.slice(1).filter( function(s){ return s; } );
				parts = rel.substr( pfx.length + m[0].length );
				parts = parts && parts.split( '/' ) || [];
				deep( body[path], 0 );
			}
	}

	function wide( obj, pos ) {
		var i = sub.length;
		for( var n in obj )
			if( obj.hasOwnProperty(n) && n.charAt(0) != '_' ) {
				sub[i] = n;
				deep( obj[n], pos );
			}
	}
	
	function deep( obj, pos ) {
		for( ; pos<parts.length; ++pos )
			if( parts[pos] == '*' ||
				!(obj = obj[parts[pos]]) 
			)
				break;
		
		if( typeof obj !== 'undefined' ) {
			if( pos < parts.length ) {
				if( with_interm )	cb( sub, obj );
				wide( obj, pos+1 );
			} else 						
				cb( sub, obj );
		}
	}
}

function mergeDescendants( pfx, from ) {
	var result = {};
	for( var rel in from )
		if( from.hasOwnProperty(rel) && rel.substr( 0, pfx.length ) == pfx ) {
			result[ rel.substr( pfx.length+1 ) ] = from[rel];
			delete from[rel];
		}
	return result;
}
