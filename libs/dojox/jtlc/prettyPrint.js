// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.prettyPrint" );

dojox.jtlc.prettyPrint = function( js ) {
	var	brackets = {
			'/*': { suffix: '*/', allow: '|*/' },
			'//': { suffix: '\n', allow: '|\n' },
			'"' : { suffix: '"', allow: '|"' },
			"'" : { suffix: "'", allow: "|'" },
			"for(": { suffix: ")", allow: "|(|)" },
			"(": { suffix: ")", allow: "|(|)" }
		},
		stack = [ { allow: '|/*|*/|//|"|\'|;|{|}|\n|for(' } ],
		indent = '\t';

	return ( '\n' + js ).replace(
		/(?:\/\*|\*\/|\/\/|[;{}]\s*|["')\n]|\\.|(?:for)?\()/g,
		function( symbol, offset, src ) {

			var	next = offset + symbol.length,
				spaces = /\s+$/.exec(symbol);
			if( spaces && spaces[0] != symbol )
				symbol = symbol.substr( symbol, symbol.length - spaces[0].length );

			if( symbol.substr(0,1) == '\\' ||
				stack[0].allow.indexOf( '|'+symbol ) < 0 )	
				return src.substring( offset, next );

			if( stack[0].suffix === symbol )	stack.shift();
			else if( symbol in brackets )		stack.unshift( brackets[symbol] );

			if( symbol == '\n' ) return symbol + indent;
			if( '{};'.indexOf( symbol ) < 0 )	return symbol;
		
			var before = '', after = '\n' + indent;

			if( symbol == '{' )	{
				indent += '\t';
				after  += '\t';
			} else if( symbol == '}' )	{
				indent = indent.substr( 0, indent.length-1 );

				if( '};'.indexOf( src.substr( offset-1, 1 ) ) < 0 )
					before = '\n' + indent + '\t';

				if( ');,'.indexOf( src.substr( next, 1 ) ) >= 0 )
						after = '';
				else	after = '\n' + indent;
			}

			return before + symbol + after;
		}
	).replace( /\t(\}|$)/g, '$1' );
}

