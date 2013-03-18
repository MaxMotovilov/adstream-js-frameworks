// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.form" );

dojo.require( "adstream.views._base" );
dojo.require( "dojo.on" );
dojo.require( "dijit._WidgetBase" );

(function(d){

dojo.declare( 'adstream.views.pushButton.Button', [dijit._WidgetBase, adstream.views.EventEmitter], {

	activationEvent: "",

	postCreate: function() {
		this.own( d.on( this.domNode, 'click', dojo.hitch( this, '_onClick' ) ) );
		this.inherited( arguments );
	},

	_onClick: function( evt ) {
		d.stopEvent( evt );
		this.emitEvent( this.activationEvent );
	}

} );

})(dojo);
