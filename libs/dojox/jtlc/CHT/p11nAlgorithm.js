// Copyright (C) 2014 12 Quarters Consulting
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.CHT.p11nAlgorithm" );

dojox.jtlc.CHT.p11nAlgorithm = (function(){

	// Based on https://developer.mozilla.org/en-US/docs/Mozilla/Localization/Localization_and_Plurals

	var rules = {
			// FIXME: add all other locales
			en: 1, es: 1, it: 1, de:1, pt: 1, 'pt-br': 2, fr: 2, ru: 7, uk: 7, be: 7
		},

		algorithms = [
			function() { return 0 },
			function( n ) { return n==1 ? 0 : 1 },
			function( n ) { return n==0 || n==1 ? 0 : 1 },
			function( n ) { return n==0 ? 0 : n!=11 && n%10==1 ? 1 : 2 },
			function( n ) { return n==1 || n==11 ? 0 : n==2 || n==12 ? 1 : inRange( 3, n, 10 ) || inRange( 13, n, 19 ) ? 2 : 3 },
			function( n ) { return n==1 ? 0 : n==0 || inRange( 1, n%100, 19 ) ? 1 : 2 },
			function( n ) { return n%10==1 && n!=11 ? 0 : n%10==0 || inRange( 11, n%100, 19 ) ? 1 : 2 },
			function( n ) { return n%10==1 && n!=11 ? 0 : inRange( 2, n%10, 4 ) && !inRange( 12, n, 14 ) ? 1 : 2 },
			function( n ) { return n==1 ? 0 : inRange( 2, n, 4 ) ? 1 : 2 },
			function( n ) { return n==1 ? 0 : inRange( 2, n%10, 4 ) && !inRange( 12, n, 14 ) ? 1 : 2 },
			function( n ) { return n%100==1 ? 0 : n%100==2 ? 1 : n%100==3 || n%100==4 ? 2 : 3 },
			function( n ) { return n==1 ? 0 : n==2 ? 1 : inRange( 3, n, 6 ) ? 2 : inRange( 7, n, 10 ) ? 3 : 4 },
			function( n ) { return n==0 ? 5 : n==1 ? 0 : n==2 ? 1 : inRange( 3, n%100, 10 ) ? 2 : inRange( 0, n%100, 2 ) ? 4 : 3 },
			function( n ) { return n==1 ? 0 : n==0 || inRange( 1, n%100, 10 ) ? 1 : inRange( 11, n%100, 19 ) ? 2 : 3 },
			function( n ) { return n%10==1 ? 0 : n%10==2 ? 1 : 2 },
			function( n ) { return n%10==1 && n!=11 ? 0 : 1 },
			function( n ) { return n==1 ? 0 : n%10==1 && !{11:1, 71:1, 91:1}[n] ? 1 : n%10==2 && !{12:1, 72:1, 92:1}[n] ? 2 : 
								   {3:1, 4:1, 9:1}[n%10] && !{13:1, 14:1, 19:1, 73:1, 74:1, 79:1, 93:1, 94:1, 99:1}[n] ? 3 : n%1000000==0 ? 4 : 5 }
		];

	function inRange( a, b, c ) {
		return a <= b && b <= c;
	}

	return function( value, words ) {
		var n = Number( value );
		if( Number.isNaN( n ) )
			throw Error( "p11nAlgorithm: \"" + value + "\" is not a number" );
		n = Math.round( Math.abs( n ) );

		var i = algorithms[ rules[dojo.locale.toLowerCase()] || rules[dojo.locale.substr(0,2).toLowerCase()] || 0 ]( value );
		return words[i] || words[0];
	}
})();