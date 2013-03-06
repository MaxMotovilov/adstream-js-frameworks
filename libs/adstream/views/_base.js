// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views._base" );
dojo.require( "dojo.Evented" );
dojo.require( "dojo.on" );

(function(d){

var keys = Object.keys || 
	function( o ) {
		if( !o ) return [];
		var v = [];
		for( var k in o )
			if( o.hasOwnProperty( k ) )
				v.push( k );
		return v;
	}

adstream.views.formatParams = function( dict, filter ) {
	var s = [];
	for( var k in dict )
		if( !filter || k in filter )
			s.push( k + ":" + dict[k] );
	return s.join( "," );
}

adstream.views.validate = function( slot, predicate ) {
	return function(v) {
		if( arguments.length < 1 )
			return slot();
		else return predicate( v ) ? slot( v ) : slot();
	}
}

dojo.declare( 'adstream.views.Scope', d.Evented, {
	constructor: function( props ) {
		d.mixin( this, props );
	},

	classList: function() {
		var cls = {};
		this.classes.replace( /\w+/g, function( c ) { 
			cls[c] = true; 
			return "";
		) );
		return keys( cls ).join( " " );	
	},

	bindModule: function( scope, self, args ) {
		return function() {
			var a = Array.prototype.slice.call( arguments, 0 );
			while( a.length < args.length )
				a.push( args[a.length] );
			return self.apply( scope, a );
		}
	},

	refresh: function( node ) {
		if( typeof this.self !== 'function' )
			throw Error( "Composite is not a View: $@.composite.self is incorrect" );
		this.self().render( node, 'replace' );
	}
} );

dojo.declare( 'adstream.views.EventEmitter', null, {
	emitEvent: function( type, props ) {
		d.on.emit( this.domNode, type, d.mixin( {
			cancelable: true,
			bubbles: true
		}, props ) );
	}
} );

adstream.views.backupCopy = function( obj, copy ) {
	if( copy )  return clone( copy, obj );
	else		return clone( obj, delegateToPrototype( obj ) );
}

var ArrayBuffer = (function(){return this;})().ArrayBuffer;

function clone( from, to ) {
	for( var i in to )
		if( to.hasOwnProperty(i) && !from.hasOwnProperty(i) )
			delete to[i];
	for( var i in from )
		if( from.hasOwnProperty(i) ) {
			if( !from[i] || typeof from[i] !== 'object' )
				to[i] = from[i];
			else if( from[i] instanceof Date )
				to[i] = Date( from[i] );
			else if( from[i] instanceof RegExp )
				to[i] = RegExp( from[i] );
			else if( from[i] instanceof Array || ArrayBuffer && from[i] instanceof ArrayBuffer )
				to[i] = from[i].slice( 0 );
			else
				to[i] = clone( from[i], createFromPrototype(from[i]) );
		}
		
	return to;
}

function createFromPrototype( obj ) {
	var proto =	Object.getPrototypeOf && Object.getPrototypeOf( obj );

	if( !proto )
		if( obj._fork && adstream.data && adstream.data.schema && obj instanceof adstream.data.schema.Node )
			return obj._fork();
		else
			return {};

	return Object.create ? Object.create( proto ) : d.delegate( proto );
}

})( dojo );
