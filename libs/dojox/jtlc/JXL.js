dojo.provide( "dojox.jtlc.JXL" );

dojo.require( "dojox.json.query" );
dojo.require( "dojox.jtlc.tags" );
dojo.require( "dojox.jtlc.compile" );

/* JXL: JSON Transformation Language: provides syntactic sugar where tags are omitted */

dojo.declare( 'dojox.jtlc.JXL', dojox.jtlc.Language, {

	replaceLanguage:		dojo.replace,
	queryLanguage:			dojox.json.query,

	/* String: if in position of a loop generator, 
	   assumed to be a query. Otherwise it is assumed
	   to be a Javascript expression */
	string: function( value ) {
		this.compile(
			this.loop && !this.loop.started() ? 
				dojox.jtlc.tags.query( value ) : 
				dojox.jtlc.tags.expr( value )
		);
	},

	/* Number: assumed to be quoted */
	number: function( value ) {
		this.compile( dojox.jtlc.tags.quote( value ) );
	},

	/* Boolean: assumed to be quoted */
	'boolean': function( value ) {
		this.compile( dojox.jtlc.tags.quote( value ) );
	},

	/* Function: called with arg(0) */
	'function': function( fn ) {
		this.compile( dojox.jtlc.tags.bind( fn ) );
	},

	/* Object with constructor that's not a tag: assumed to be quoted */
	unknownObject: function( obj ) {
		this.compile( dojox.jtlc.tags.quote( obj ) );
	},

	/* Null object: assumed to be quoted (may be elided later) */
	nullObject:	function( obj ) {
		this.expressions.push( 'null' );
	}
} );

