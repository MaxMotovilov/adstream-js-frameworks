// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.data.Watcher' );

dojo.declare( 'adstream.data.Watcher', null, {

	constructor: function() {
		this._dataWatches = {};
	},

	watch: function( method, obj, rel_url, options ) {
		this._dataWatches[ obj.watch( dojo.hitch( this, method ), rel_url, options ) ] = obj.service();
	},

	ignore: function( obj, rel_url ) {
		var	del = [];
		for( var ru in this._dataWatches ) 
			if( this._dataWatches.hasOwnProperty( ru ) && ru.substr( 0, rel_url.length ) == rel_url ) {
				this._dataWatches[ru].ignore( ru );
				del.push( ru );
			}
			
		dojo.forEach( del, function(ru){ delete this._dataWatches[ ru ]; } );
	},

	uninitialize: function() {
		for( var rel_url in this._dataWatches )
			this._dataWatches[rel_url].ignore( rel_url );
		return this.inherited( arguments );
	}
} );
