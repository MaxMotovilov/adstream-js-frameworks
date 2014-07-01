dojo.require( 'dojox.jtlc.CHT' );
dojo.require( 'dojo.promise.all' );

var cht = new dojox.jtlc.CHT( 
		{ 
			loadTemplates: loadDependencies, 
			elements: { load: { 
				tag: function( cht, elt ) { return cht.elements.when.tag( cht, elt ); }, 
			    sections: function( elt ) {
					return elt.kwarg.async !== 'false' && {	"" : {allowArgument:true} };
				}
			} },
		} 
	),
	fs = module.require('fs'),
	path = module.require('path'),
	cache = {};

var dojo_getObject = dojo.getObject;

dojo.getObject = function( x ) {
	return dojo_getObject( x ) || function(){};
}

if( process.argv.length <= 2 ) {
	process.stderr.write( "node collect.js [-r RootPath] File\n" );
	process.exit(1);
}

var root = path.resolve( '.' ),
	files = process.argv.slice(2).reduce(
		function( list, one ) {
			if( list.length > 0 && list[list.length-1].charAt(0) == '-' )
				option( list.pop(), one );
			else
				list.push( one );
			return list;
		}, []
	);

if( files.length > 0 && files[files.length-1].charAt(0) == '-' )
	throw Error( "Argument expected after " + files.pop() );

function option( opt, val ) {
	if( opt == "-r" )	
		root = path.resolve(val);
	else
		throw Error( "Unknown option: " + opt );
}

if( files.length != 1 ) 
	throw Error( "Expected 1 input file, got " + files.length );

dojo.when( 
	load( files[0] ),
	function( ns ) {
		var dict = {};
		for( var n in ns )
			if( ns.hasOwnProperty(n) ) try {
				dojox.jtlc.compile( ns[n], cht, { i18nDictionary: dict } );
			} catch( err ) {
				process.stderr.write( n + ": " + err.toString() + '\n' );
			}
		process.stdout.write( dojo.toJson( dict, true ) );
	}, function( err ) {
		process.stderr.write( err.toString() + '\n' );
	}
);

function load( file, mid ) {
	var d = new dojo.Deferred();

	fs.readFile( file, 'utf8', function( err, result ) {
		if( err ) d.reject( err );
		else d.resolve( result );
	} );

	return dojo.when( d, function( text ) {
		return cht.parse( text, mid && (cache[mid] = {}) );
	} );
}

function getModule( mid ) {
	return cache[mid] || 
		   ( cache[mid] = load( path.join( root, mid.replace( /\.([^.]+)$/, '/CHT/$1' ).replace( /\./g, '/' ) + '.cht' ), mid ) );
}

function loadDependencies( refs ) {

	var module_refs = {};

	Object.keys( refs ).forEach( function( ref ) {
		var m = /^(.*)\.([^.]+)$/.exec( ref );
		if( m )
			(module_refs[m[1]] || (module_refs[m[1]]=[])).push( m[2] );
	} );

	if( Object.keys( module_refs ).length == 0 )
		return refs;
	
	return dojo.when(
		dojo.promise.all( Object.keys( module_refs ).map( getModule ) ),
		defineRefs.bind( null, refs, module_refs )
	);
}

function defineRefs( refs, module_refs, modules ) {

	Object.keys( module_refs ).forEach( function( mdl, i ) {
		module_refs[mdl].forEach( function( ref ) { 
			if( !modules[i][ref] )
				throw Error( "<? " + ref + " ?> is not defined in " + mdl );
			refs[ mdl + '.' + ref ] = modules[i][ref];
		} );
	} );

	Object.keys( refs )
		  .filter( function( r ) { return r.indexOf('.')<0; } )
		  .forEach( function( ref ) {
			Object.keys( module_refs ).forEach( function( mdl, i ) {
				if( modules[i][ref] ) {
					if( !refs[mdl + '.' + ref] )
						refs[mdl + '.' + ref] = modules[i][ref];
				}
			} );
		  } );

	return refs;
}

