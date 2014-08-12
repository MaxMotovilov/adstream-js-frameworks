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

	startup: function() {
		this.mapper = adstream.navigator.core.mapper();
		dojo.subscribe('/dojo/hashchange', dojo.hitch(this, this.onHashChanged) );
		this.onHashChanged();
	},

	onHashChanged: function() {
		var hash = dojo.hash(),
			mapped = hash && this.mapper( hash );

		adstream.navigator.core.getInterceptors(hash).then(function(res){
			if( !mapped ) {
				if( adstream.navigator.config.defaultHash )
					dojo.hash( adstream.navigator.config.defaultHash ); // Auto-forward to default hash
			} else if( this._lastLoaded !== hash ) {
				this._lastLoaded = hash;
				dojo.when( 
					mapped.execute( hash, this.domNode ),
					done, done
				);
			}
		}, function(newHash){
			dojo.hash(newHash);
		})

		function done( result ) {
			if( result instanceof Error )
				logError( result );
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
