// Copyright (C) 2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.data.extensions' );

(function(){

	var d = dojo;
	
	adstream.data.extensions._Extension = d.extend( function(){}, {

		install: function( obj ) {
			for( var m in this.extensionMethods )
				this._installMethod( obj, m );
			this._extended = obj;
		},

		uninstall: function() {
			for( var m in this.extensionMethods )
				this._extended._override( m );
			delete this._extended;
		},

		_installMethod: function( obj, name ) {
			var	_this = this, mtd = this.extensionMethods[name];
			this[name] = d.hitch( obj, obj._override( name, function() {
				return mtd.apply( this, extraArg( _this, arguments ) );
			} ) );
		}

	} );

	function extraArg( _this, args ) {
		var	args = Array.prototype.slice.call( args, 0 );
		args.unshift( _this );
		return args;
	}
})();
