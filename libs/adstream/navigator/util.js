// Copyright (C) 2012-2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'adstream.navigator.util' );

if( !dojox || !dojox.promise ) {
	dojo.provide( 'dojox.promise' );

	dojo.require( 'dojox.lang.functional.fold' );

	(function(){

		var d = dojo,
			reduce = dojox.lang.functional.reduce;

		function composeAll(fail_on_error) {
			return function(array) {
				if( !(array instanceof Array) )
					array = Array.prototype.slice.call(arguments);
				else
					array = array.slice();
				var todo = reduce( array, function(count,p){ return count+(p&&p.then?1:0); }, 0 );
				if( todo === 0 )	return array;

				var deferred = new d.Deferred( fail_on_error && cancel ),
					once = true;

				d.forEach( array, function( p, i ) {
					if( p && p.then )
						d.when( p, succeed, fail_on_error ? failOnce : succeed );

					function succeed( v ) {
						array[i] = v;
						if( --todo === 0 )
							deferred.resolve(array);
					}

					function failOnce( err ) {
						if( once ) {
							once = false;
							cancel( err, i );
							deferred.reject( err );
						}
					}
				});

				function cancel( err, except ) {
					d.forEach( array, function(p,i) {
						if( i !== except && p && p.then && p.cancel )	
							p.cancel( err );
					} );
				}

				return deferred;
			};
		}

		dojox.promise.all = composeAll(false);
		dojox.promise.allOrNone = composeAll(true);

	})();
}
