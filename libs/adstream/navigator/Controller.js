// Copyright (C) 2013-2015 12 Quarters Consulting
// Copyright (C) 2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.navigator.Controller' );

dojo.require( 'adstream.navigator.core' );
dojo.require('dojo.hash');
dojo.require( 'dijit._Widget' );

(function(){

dojo.declare('adstream.navigator.Controller', [dijit._Widget], {

	"-chains-": {
		startup: "after"
	},

	constructor: function() {
		this._hashes = [];
		this.execute = dojo.hitch( this, this.execute );
	},

	startup: function() {
		this.mapper = adstream.navigator.core.mapper();
		dojo.subscribe('/dojo/hashchange', dojo.hitch(this, this.onHashChanged) );
		this.onHashChanged();
	},

	onHashChanged: function() {
		if( this._hashes.unshift( dojo.hash() ) == 1 )
			this.execute();
	},

	execute: function() {

		var hash, mapped, action, guard;

		while( this._hashes.length ) {
			this._hashes.splice( 1, this._hashes.length-1 );

			hash = this._hashes.shift();
			if( this._lastLoaded == hash )
				break;

			guard = dojo.hash();
			action = hash && (mapped = this.mapper( hash )) && mapped.prepare( hash, this.domNode );
			if( guard != dojo.hash() ) {
				action = null;
				continue;
			}

			if( !action ) {
				if( !adstream.navigator.config.defaultHash || hash == adstream.navigator.config.defaultHash ||
					hash && adstream.navigator.config.allowForeignHashes
				)
					break;
				this._hashes.unshift( adstream.navigator.config.defaultHash );
				dojo.hash( this._hashes[0], true );
				continue;
			}
		}

		if( action ) {
			this._lastLoaded = hash;
			dojo.when( action(), this.execute, logError );
		}
	}
});

function logError( err ) {
	if (dojo.config.isDebug) {
		var stack = err && err.stack && err.stack.replace(/^[^\(]+?[\n$]/gm, '')
			  .replace(/^\s+at\s+/gm, '')
			  .replace(/^Object.<anonymous>\s*\(/gm, '{anonymous}()@');
		if( stack )	err.traceback = stack.split( '\n' );
		console.error( err );
	}
}

})();
