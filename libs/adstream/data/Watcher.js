dojo.provide( 'adstream.data.Watcher' );

dojo.declare( 'adstream.data.Watcher', null, {

	constructor: function() {
		this._dataWatches = {};
	},

	watch: function( method, obj, rel_url, options ) {
		this._dataWatches[ obj.watch( dojo.hitch( this, method ), rel_url, options ) ] = obj.service();
	},

	ignore: function( obj, rel_url ) {
		rel_url = obj.ignore( rel_url );
		if( rel_url in this._dataWatches )	delete this._dataWatches[ rel_url ];
	},

	destroy: function() {
		for( var rel_url in this._dataWatches )
			this._dataWatches[rel_url].ignore( rel_url );
		return this.inherited( arguments );
	}
} );
