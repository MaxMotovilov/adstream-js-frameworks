// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.change" );

dojo.require( "adstream.views._base" );
dojo.require( "dojo.on" );
dojo.require( "dijit._WidgetBase" );

(function(d){

var OnChange = dojo.declare( dijit._WidgetBase, {

	form:  null,
	scope: null,

	postCreate: function() {
		this.own( this.form.on( 'dataChange', dojo.hitch( this, '_onChange' ) ) );
		this._onChange();
		this.inherited( arguments );
	}
} );

dojo.declare( 'adstream.views.change.SetClassIf', OnChange, {

	toggleClass: "",

	_onChange: function() {
		var state = this.scope.setClassIf( this.form.data );
		if( state != this.scope.lastSetClassIfState ) {
			this.scope.lastSetClassIfState = state;
			d.toggleClass( this.domNode, this.toggleClass, state );
		}
	}
} );

dojo.declare( 'adstream.views.change.SetClassIfFormReady', OnChange, {

	toggleClass: "",

	_onChange: function() {
		if( this.form.ready != this.scope.lastFormReadyState ) {
			this.scope.lastFormReadyState = this.form.ready;
			d.toggleClass( this.domNode, this.toggleClass, this.form.ready );
		}
	}
} );

dojo.declare( 'adstream.views.change.RefreshIfChanged', OnChange, {

	view: null,

	_onChange: function() {
		if( this.scope.refreshIfChanged( this.form.data ) != this.scope.lastRefreshKey )
			(this.view || this.scope).refresh( this.domNode );
	}
} );

})(dojo);
