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
		d.own( form.on( 'dataChange', dojo.hitch( this, '_onChange' ) ) );
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
		if( this.formReady != this.scope.lastFormReadyState ) {
			this.scope.lastFormReadyState = this.formReady;
			d.toggleClass( this.domNode, this.toggleClass, this.formReady );
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
