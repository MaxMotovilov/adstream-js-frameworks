// Copyright (C) 2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "adstream.views.form" );

dojo.require( "adstream.views._base" );

(function(d){

dojo.declare( 'adstream.views.validate.Mixin', adstream.views.EventEmitter, {

	validateOn: 		"value",
	validatePredicate:	null,
	validateMessage:	null,

	slot: null,

	postCreate: function() {
		if( this.slot )
			this.slot = this.validateOn == "form" ?
				this.validateAfter( this.slot ) :
				this.validateBefore( this.slot );
		this.inherited( arguments );
	},

	validateAfter: function( slot ) {

		var _this = this;

		return function( v ) {
			if( arguments.length < 1 )
				return slot();
			else {
				var before = slot(),
					after = slot( v );
				if( after == v && !_this.validatePredicate() ) {
					_this.validationFailed();
					return slot( before );
				}
				return after;
			}
		}
	},

	validateBefore: function( slot ) {
		
		var _this = this;

		return function( v ) {
			if( arguments.length < 1 )
				return slot();
			else if( !_this.validatePredicate( v ) ) {
				_this.validationFailed( v );
				return slot();
			} else 
				return slot( v );
		}
	},

	validationFailed: function( v ) {
		var props = {};

		if( this.validateMessage )
			props.message = (arguments.length < 1 ? this.validateMessage(): this.validateMessage( v )).toString();

		this.emitEvent( "validationFailed", props );
	}
} );

})(dojo);
