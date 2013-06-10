// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.input" );

dojo.require( "adstream.views._base" );
dojo.require( "dijit._WidgetBase" );
dojo.require( "dijit._FocusMixin" );
dojo.require( "dojo.on" );

(function(d){

d.declare( 'adstream.views.input.KeyInput', [ dijit._WidgetBase, dijit._FocusMixin ], {

		configureKeyInput: function( key_map ) {
			var	km = key_map.modify ? d.mixin( {}, this.keyInputConfiguration ) : {};
			for( var k in key_map )
				if( k in d.keys )
					km[k] = key_map[k];
			this.keyInputConfiguration = km;
		},

		"-chains-": {
			_onFocus: "before",
			_onBlur: "before"
		},

		_onFocus: function() {
			this._keydownHandle = this.on( "keydown", "_onKeyDown" )[0];
			this._emit( "focus" );
		},

		_onBlur: function() {
			this._emit( "blur" );
			this._keydownHandle.destroy();
			delete this._keydownHandle;	
		},

		_onKeyDown: function( evt ) {
			if( this._emit( evt.keyCode, evt ) )
				d.stopEvent( evt );
		},

		_emit: function( what, evt ) {
			if( !( what=this.keyInputConfiguration[what] ) )
				return false;

			if( !(what instanceof Array) )
				what = [what];

			for( var i=0; i<what.length; ++i )
				this[what[i]].call( this, evt );
			
			return true;
		}
	} )
);

})(dojo);

