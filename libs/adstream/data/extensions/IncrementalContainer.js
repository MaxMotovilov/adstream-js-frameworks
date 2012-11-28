// Copyright (C) 2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.data.extensions.IncrementalContainer' );

dojo.require( 'adstream.data.extensions' );

(function(){

	var d = dojo;

	d.declare( 'adstream.data.extensions.IncrementalContainer', adstream.data.extensions._Extension, {

		constructor: function( opt ) {
			d.mixin( this, opt );
		},

		extendView: function( old, add ) {
			for( var p in add )
				if( !{count:1,offset:1}[p] && 
					(!( p in old ) || add[p] != old[p]) 
				)
					return false;

			if( add.count + add.offset == old.offset ) {
				old.count = (old.count||0) + add.count;
				old.offset = add.offset;
			} else if( (old.count||0) + (old.offset||0) == add.count ) {
				old.count = (old.count||0) + add.count;
			} else
				return false;

			return true;
		},

		compatibleFilter: function( old, add ) {
			for( var p in add )
				if( !( p in old ) || add[p] != old[p] )
					return false;
			return true;
		},

		extensionMethods: {
			_unmarshal: function( ext, data, props, forkme ) {
				var	old_view = this._.hasOwnProperty( 'view' ) 
						? this._.view : d.delegate( this._.view );
				if( ext.compatibleFilter( this._.filter || {}, data._ && data._.filter || {} ) &&
					!ext.extendView( old_view, data._ && data._.view || {} )
				) {
					this._.view = old_view;
					if( this._._view )	delete this._._view;
					(data._ || (data._ = {})).partial = true;
					if( data._.filter )	delete data._.filter;
				}
				
				return ext.unmarshal( data, props, forkme );
			}
		}
	} );
} )();
