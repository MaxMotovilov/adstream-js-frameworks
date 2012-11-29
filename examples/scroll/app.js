var generator_methods = {
	map: function( mapf ) {
		var	g = this;
		return generator( function() {
			return mapf( g() );
		} );
	},

	filter: function( filterf ) {
		var g = this;
		return generator( function() {
			var v;
			while( !filterf( v = g() ) )
				;
			return v;
		} );
	},

	skip: function( n ) {
		var g = this;
		return generator( function() {
			while( n ) {
				--n;
				g();
			}
			return g();
		} );
	},

	collect: function( n ) {
		var g = this, v = [];
		while( n-- )
			v.push( g() );
		return v;
	}
};

function generator( g ) {
	return connect.utils.merge( g, generator_methods );	
}

function numbers() {
	var	n = 1;
	return generator( function() {
		return n++;
	} );
}

function toWords( num ) {

	return { value: num, text: str( cat(
		num >= 1000 ? cat( under1000( Math.floor( num/1000 ) ), "thousand" ) : [],
		under1000( num % 1000 )
	) ) };

	function under1000( num ) {
		return cat( 
			num >= 100 ? cat( under10( Math.floor( num/100 ) ), "hundred" ) : [],
			under100( num % 100 )
		);
	}

	function under100( num ) {
		return num < 10 ?
			under10( num ) 
		:      num < 20 ?
			under20( num-10 )
		:	cat( under100tens( Math.floor( num/10 ) ), under10( num % 10 ) );
	}

	function under10( num ) {
		return [ "", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine" ][num];
	}

	function under20( num ) {
		return [ "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen" ][num];
	}

	function under100tens( num ) {
		return [ "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety" ][num];
	}

	function str( a ) {
		return a instanceof Array ? a.join( ' ' ) : a.toString();
	}

	function cat( a, b ) {
		if( a instanceof Array && b instanceof Array ) {
			a.push.apply( a, b );
			return a;
		} else if( a instanceof Array ) {
			a.push( b );
			return a;
		} else if( b instanceof Array ) {
			b.unshift( a );
			return b;
		} else
			return [a,b];
	}
}

function contains( ctx ) {
	return function( o ) {
		return o.text.split( ' ' ).some( function( w ) { return w.substr( 0, ctx.length ) == ctx; } );
	}
}

// =====================
//	node.js server code

var	http = require('http'),
	connect = require('connect'),
    adstream_data = require( 'adstream-data' );

function ScrollApp() {}
ScrollApp.prototype = {

	configure: function( app ) {
		app.get( 'numbers/*', this.get_numbers );
	},

	get_numbers: function( key ) {
		var metadata = this.request.get( key.url(), { view: { offset: 0, count: 10 }, filter: { contains: "" } } )._,
			result = {};
		
		numbers()
			.filter( function(n){
				if( n >= 1000000 )	
					throw Error( 'Context "' + metadata.filter.contains + '" could not be found' );
				return true;
			} )
			.map( toWords )	
			.filter( contains( metadata.filter.contains ) )
			.skip( metadata.view.offset )
			.collect( metadata.view.count )
			.forEach( function( v ) {
				result[ v.value ] = { text: v.text };
			} );

		this.response.set( key.url(), result, metadata );

		return false;
	}
}

var app = module.exports = connect();
app.use( '/svc', adstream_data( ScrollApp ) );

app.use( connect.static('./front') );

http.createServer( app ).listen( 8086 );
console.log('Server started listening at port %d', 8086 );


