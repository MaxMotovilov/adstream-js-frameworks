// Copyright (c) 2016 12 Quarters Consulting
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var path = require( 'path' ),
	fs = require( 'fs' ),
	dojo = { 
		global: Object.create( global ), 
		config: { paths: {} } 
	};

exports = module.exports = dojo.global.dojo = dojo;

exports.registerPrefix = function( prefix, path_or_module ) {
	dojo.config.paths[prefix] = typeof path_or_module === "string" 
		? path_or_module
		: path.join( path.dirname( ( path_or_module || module.parent ).filename ), prefix.replace( /\./g, "/" ) )
	;

	prefix = prefix.replace( /\..*$/, "" );

	if( !(prefix in dojo.global) )
		dojo.global[prefix] = {};
}

exports.registerPrefix( "dojo", module );

dojo.require = function( module_id ) {

	var globals = Object.keys( dojo.global );

	execute( 
		load( module_id ), 
		globals,
		globals.map( function( gbl ) { return dojo.global[gbl] } )
   );
}

function load( module_id )
{
	var mdl_path, existing = dojo.global, id;

	module_id.replace( /\w+/g, function( w ) {
		existing = existing && existing[w];
		return ""; 
	} );

	if( existing )
		return;

	for( id=module_id; id && !mdl_path; )
		if( !(mdl_path = dojo.config.paths[id]) )
			id = id.replace( /\.\w+$/, "" );

	if( !mdl_path )
		throw Error( module_id + " cannot be mapped to a path" );

	mdl_path = path.join( mdl_path, module_id.substr( id.length+1 ).replace( /\./g, "/" ) ) + ".js";

	return fs.readFileSync( mdl_path ).toString();
}

function execute( text, global_names, global_values ) {
	(new Function( global_names.join( "," ), text ))
		.apply( dojo.global, global_values );
}

execute( load( "dojo.base" ), [ "dojo", "require" ], [ dojo, require ] );

