// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.form" );

dojo.require( "adstream.views._base" );
dojo.require( "dojo.on" );
dojo.require( "dijit._WidgetBase" );

(function(d){

adstream.views.form.scopeClass = function( attributes ) {

	var result;

	if( attributes && attributes.validWhen )
		add( 'hasValidContent', hasValidContent( attributes.validWhen ) );

	if( attributes && attributes.backupCopy )
		add( 'backupCopy', typeof attributes.backupCopy === 'function' ? attributes.backupCopy : adstream.views.backupCopy );

	return !result && ( !attributes || !attributes.scopeMixin )
		? Scope
		: d.declare( baseClassList( Scope, attributes && attributes.scopeMixin ), result || {} );

	function add( name, prop ) {
		if( !result ) result = {};
		results[name] = prop;
	}
}

var Scope = dojo.declare( adstream.views.Scope, {

	initData: function( data ) { 
		if( this.backupCopy ) {
			this.data =  this.backupCopy( data );
			this._origData = data; 
		} else
			this.data = data;

		this.ready = this.hasValidContent();
	},

	reset: function( evt, node ) {
		if( this.self ) {
			d.stopEvent( evt );
			this.refresh( node );
		} else
			this.emit( 'reset', evt );
	},

	submit: function( evt ) {	
		if( this.hasValidContent() ) {
			if( this.backupCopy )
				this.backupCopy( this.data, this._origData );
			this.emit( 'submit', evt );
			return true;
		} else {
			d.stopEvent( evt );
			return false;
		}
	},

	hasValidContent: function() { return true; }

} );

dojo.declare( 'adstream.views.form.Form', [dijit._WidgetBase, adstream.views.EventEmitter], {

	scope: null,

	postCreate: function() {
		this._connect( 'reset' );
		this._connect( 'submit' );
		this._connect( 'dataChange' );
		this.inherited( arguments );
	},

	_connect: function( ev_name ) {
		this.own( d.on( this.domNode, ev_name, dojo.hitch( this, ev_name ) ) );
	},

	reset: function( evt ) {
		this.scope.reset( evt, this.domNode );
	},

	submit: function( evt ) {
		if( this.scope.submit( evt, this.domNode ) )
			this.emitEvent( "dataChange", { ignore: true } );
	},

	dataChange: function( evt ) {
		if( evt.ignore )
			delete evt.ignore;
		else {
			d.stopEvent( evt );
			this.scope.ready = this.scope.hasValidContent();
			this.scope.emit( 'dataChange', this.scope.ready );
		}
	}
} );

function hasValidContent( predicate ) {
	return predicate( this.data );
}

function baseClassList( first, rest ) {
	return rest ? [ first ].concat( rest ) : first;
}

})( dojo );
