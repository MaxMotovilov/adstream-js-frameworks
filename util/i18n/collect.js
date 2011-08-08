/*
djConfig = {
	baseUrl: '../../dojo-release-1.6.1-src/dojo/', 
	modulePaths: { 
		'dojox.jtlc': '../../jtlc/js/jtlc'
	}
};

load( '../../dojo-release-1.6.1-src/dojo/dojo.js' );
*/

dojo.provide( 'dojox.jtlc.CHT.instance' );
dojo.require( 'dojox.jtlc.CHT' );

// FIXME: does not support cross-module access to structured templates
// as the section names cannot be known without loading and analyzing
// the referenced CHT file.

function loadNothing( ns ) {
	for( var tpl in ns )
		ns[tpl] = new cht._userDefinedElement( { arg: /\.([^.]*)$/.exec( tpl )[1] } );
	return ns;
}

var cht = new dojox.jtlc.CHT( { loadTemplates: loadNothing } ),
	file = dojo.global.arguments[0];

var dojo_getObject = dojo.getObject;

dojo.getObject = function( x ) {
	return dojo_getObject( x ) || function(){};
}

dojo.when( 
	cht.parse( readFile( file ) ), 
	function( ns ) {
		var dict = {};
		for( var n in ns )
			if( ns.hasOwnProperty(n) )
				dojox.jtlc.compile( ns[n], cht, { i18nDictionary: dict } );
		print( dojo.toJson( dict, true ) );
	}
);

