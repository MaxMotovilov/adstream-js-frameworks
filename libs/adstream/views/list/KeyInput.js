// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.list.KeyInput" );

dojo.require( "adstream.views.input" );

(function(d){

adstream.views.list.KeyInput = adstream.views.configurable(
	d.declare( adstream.views.input.KeyInput, {

		keyInputConfiguration: {

		}
	
	} ),
	'configureKeyInput'
);

})(dojo);

