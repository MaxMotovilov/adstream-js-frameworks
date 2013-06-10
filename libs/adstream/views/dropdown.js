// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.dropdown" );

dojo.require( "adstream.views._base" );
dojo.require( "dijit._WidgetBase" );

(function(d){

dojo.declare( 'adstream.views.dropdown.Parent', null, {

	scope: 		null,

	postCreate: function() {
		var _this = this;
		this.own( this.scope.on( "attachDropdown", function(evt) {
			_this.controlledList = evt.dropdown;
		} ) );
		this.own( this.scope.on( "detachDropdown", function() {
			delete _this.controlledList;
		} ) );
		this.inherited();
	},

	showDropdown: function( refresh ) {
		if( refresh ) this.refreshDropdown();
		d.toggleClass( this.domNode.parentNode, 'show-dropdown', true );
	},

	hideDropdown: function() {
		d.toggleClass( this.domNode.parentNode, 'show-dropdown', false );
	},

	refreshDropdown: function( /* args */ ) {
		this.scope.emit( "refreshDropdown", { args: arguments } );
	},
} );

dojo.declare( 'adstream.views.dropdown.Pane', dijit._WidgetBase, {

	scope: null,

	postCreate: function() {
		var _this = this;
		if( this.scope.self )
			this.own( this.scope.parentScope.on( "refreshDropdown", function(evt) {
				if( evt.args && evt.args.length ) {
					var args = Array.prototype.slice.call( evt.args, 0 );
					args.unshift( _this.domNode );
					_this.scope.refresh.call( null, args );
				}
				else
					_this.scope.refresh( _this.domNode );
			} ) );
		this.scope.parentScope.emit( "attachDropdown", { dropdown: this } );
		this.inherited();
	},

	cleanup: function() {
		this.scope.parentScope.emit( "detachDropdown" );
	}
} );

})(dojo);
