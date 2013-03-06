// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.change" );

dojo.require( "adstream.views._base" );
dojo.require( "adstream.data.Watcher" );
dojo.require( "dijit._WidgetBase" );

(function(d){

var Watcher = dojo.declare( [dijit._WidgetBase, adstream.data.Watcher], {

	watched: null,
	watchOptions: null,

	postCreate: function() {
		this.watch( '_onWatch', this.watched, "", this.watchOptions );
		this.inherited( arguments );
	}
};

dojo.declare( 'adstream.views.change.Watch', [ Watcher, adstream.views.EventEmitter ], {
	_onWatch: function() {
		this.emitEvent( 'dataChange' );
	}
} );

dojo.declare( 'adstream.views.change.RefreshIfChanged', Watcher, {

	scope: null,

	_onWatch: function() {
		this.scope.refresh( this.domNode );
	}
} );

})(dojo);
