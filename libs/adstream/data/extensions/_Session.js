// Copyright (C) 2014 12 Quarters Consulting
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.data.extensions._Session' );

dojo.require( 'adstream.data.extensions' );

(function(){

	var d = dojo;

	d.declare( 'adstream.data.extensions._Session', adstream.data.extensions._Extension, {
		extensionMethods: {
			_unmarshal: function( _1, data, _2, forkme ) {
				var meta = this._copyPropsIfChanged( data, this._sessionProperties, forkme );
				return meta && ( !forkme || this._fork( {}, null, meta ) );
			},

			_injectSessionProperties: function( _, params ) {
				d.forEach( this._sessionProperties, function( p ) {
					if( this._.hasOwnProperty( p ) )
						params[ '.' + p ] = this._[p];
				}, this );
			}
		}
	} );
} )();

