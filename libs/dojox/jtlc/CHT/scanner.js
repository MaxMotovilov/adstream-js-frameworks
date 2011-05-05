// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/dojox.jtlc/wiki/License

dojo.provide( "dojox.jtlc.CHT.scanner" );

dojox.jtlc._beginsWith = function( a, b ) {
	return a.substr( 0, b.length ) == b;
}

dojox.jtlc._hasPrefix = function( s, pfxs, map ) {
	for( var i=0; i<pfxs.length; ++i )
		if( dojox.jtlc._beginsWith( s, map ? map( pfxs[i] ) : pfxs[i] ) )	return pfxs[i];
	return null;
}

dojox.jtlc._tokenizeCHT = function( input )
{
	var	dj = dojox.jtlc,

		brackets = [
			{ prefix: '<!--', suffix: '-->', allow: [ '-->' ], extra: '\ufffc' },
			{ prefix: '<?', suffix: '?>', allow: [ '"', "'", '?>', '<!--' ], markup: true, extra: '\uffff' },
			{ prefix: '<', suffix: '>', allow: [ '"', "'", '{{', '>', '<!--' ], extra: '\ufffe' },
			{ prefix: '{{', suffix: '}}', allow: [ '"', "'", '(', '[', '{', '}}' ], substitution: true, extra: '\ufffd' },
			{ prefix: '{', suffix: '}', allow: [ '"', "'", '(', '[', '{', '}' ] },
			{ prefix: '(', suffix: ')', allow: [ '"', "'", '(', '[', '{', ')' ] },
			{ prefix: '[', suffix: ']', allow: [ '"', "'", '(', '[', '{', ']' ] },
			{ prefix: '"', suffix: '"', allow: [ '"', '\\' ], inSubstitution: true },
			{ prefix: '"', suffix: '"', allow: [ '"', '\\', '{{' ], inSubstitution: false },
			{ prefix: "'", suffix: "'", allow: [ "'", '\\' ], inSubstitution: true },
			{ prefix: "'", suffix: "'", allow: [ "'", '\\', '{{' ], inSubstitution: false },
			{ prefix: '\\', escape: true }
		],

		script_bracket = { suffix: '</script', allow: [ '"', "'", '{{', '</script' ] },

		stack = [ 
			{ allow: [ '<!--', '<?', '<', '{{' ] }
		],

		last_pos = 0,
		html_tag = '',
		in_substitution = false,

		parsed = input.replace( 
			/(?:<(?:[?]\s*)?\/?[a-z_]\w*|<!--|-->|[?]?>|[{][{]?|[}][}]?|["'\[\]()\\])/ig,
			function( s, pos, src ) {

				if( stack[0].escape ) {
					stack.shift();
					if( pos == lp+1 )	return s;
				}

				var pfx = dj._hasPrefix( s.toLowerCase(), stack[0].allow ),
					lp = last_pos;

				last_pos = pos + s.length;

				if( pfx ) {

					if( pfx == stack[0].suffix ) {

						var	top = stack.shift();

						if( top.substitution )	in_substitution = false;

						if( top !== script_bracket ) {
							if( !top.markup && s.charAt(s.length-1) == '>' && html_tag == 'script' ) {
								stack.unshift( script_bracket );
								return s;
							}

							return (top.substitution ? '':s) + (top.extra || '');
						}
					}

					if( pfx = dj._hasPrefix( pfx, brackets, 
							function(b){ 
								if( 'inSubstitution' in b && b.inSubstitution != in_substitution )
										return '\uffff';
								else return b.prefix; 
							} 
					) ) {
						if( pfx.escape )	return s;

						if( s.charAt(0) == '<' )
							html_tag = /^<(\/?[a-z_]*)/i.exec( s )[1].toLowerCase();

						stack.unshift( pfx );
						if( pfx.substitution )	in_substitution = true;

						return (html_tag != '/script' && pfx.extra||'') + (pfx.substitution ? '':s);
					}	
				}

				return s;
			}
		).split( /(?:\ufffc[\s\S]*?\ufffc|\ufffe|\s*\uffff\s*)/ );

	if( stack.length > 1 )
		throw Error( "Unbalanced delimiters -- expected " + dj.stringLiteral( stack[0].suffix ) );

	return parsed;
}

dojox.jtlc._CHTElement = function( text ) {

	this.text = text;

	if( /^<[?]\s*\/([a-z_]\w*(?:\s*[.]\s*[a-z_]\w*)*)[\s\S]*?[?]>$/i.exec( text ) ) {
		this.closeTag = RegExp.$1.split( /\s*[.]\s*/ ).join( '.' );
	} else	if( /^<[?]\s*([a-z_]\w*(?:\s*[.]\s*[a-z_]\w*)*)([\s\S]*?)\s*[?]>$/i.exec( text ) ) {

		var	body = RegExp.$2;

		this.openTag = RegExp.$1.split( /\s*[.]\s*/ ).join( '.' );
		this.kwarg = {}

		if( /^\s+(?![a-z]\w*=)(["']?)((?:\\.|[^\\])*?)\1(?=\s|$)/i.exec( body ) ) {
			this.arg = RegExp.$2;
			body = body.substr( RegExp.lastMatch.length );
		}

		while( body.length && /^\s+([a-z_]\w*)=/i.exec( body ) ) {
			body = body.substr( RegExp.lastMatch.length );
			var name = RegExp.$1;
			if( !/^(["']?)((?:\\.|[^\\])*?)\1(?=\s|$)/.exec( body ) )
				break;
			body = body.substr( RegExp.lastMatch.length );
			this.kwarg[name] = RegExp.$2;
		}

		if( body.length )
			throw Error( "Invalid CHT tag: " + text );

	} else throw Error( "Invalid CHT tag: " + text );
}


