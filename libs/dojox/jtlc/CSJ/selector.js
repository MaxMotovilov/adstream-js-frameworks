// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.CSJ.selector" );

dojo.require( "dojox.jtlc.parseExpression" );

(function(){

var d = dojo, dj = dojox.jtlc;

//
//	Selector  ::= Pattern { "," Pattern ... }
//	Pattern   ::= [ Node ] { { "." | ".." } NamedNode ... }
//	NamedNode ::= [ Key ] Node
//	Key		  ::= Identifier | Integer | String | "*"
//	Node	  ::= [ ":" Type | "::" Axis ] [ "[" Predicate "]" ]
//
//	Node should not be an empty sequence.
// 

function compile( text, axes ) {

	var brackets = {
			'{' : { suffix: '}', allow: '"\'([{}' },
			'(' : { suffix: ')', allow: '"\'([{)' },
			'[' : { suffix: ']', allow: '"\'([{]' },
			'"' : { suffix: '"', allow: '"' },
			"'" : { suffix: "'", allow: "'" }
		},
		stack = [ { allow: '\'"[' } ];

	
}

var Selector = d.extend(
	function( text, axes ) {
		d.mixin( this, compile( text, axes || {} ) );
		this._key = compileKey( text );
	}, {
		better: function( other ) {
		}
	}
);

dojox.jtlc.CSJ.selector = function( axes, text ) {
	axes = axes && d.mixin( {}, axes );
	var cons = function( t ) { return new Selector( t, axes ); }
	return text && cons( text ) || cons;
}

})();
