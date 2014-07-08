// Copyright (C) 2011-2013 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License
try {
dojo.provide( "dojox.jtlc.parseExpression" );
} catch(e){ }

(function(){

function applyMethod( call, method ) {
	return function() { return call.apply( method, arguments ); }
}

function _objectKeys(obj) {
	var res = [];
	for (var k in obj) {
		if (obj.hasOwnProperty(k)) {
			res.push(k);
		}
	}
	return res;
}

var map = dojo && dojo.map || applyMethod( Function.prototype.call, Array.prototype.map);
	forEach = dojo && dojo.forEach || applyMethod( Function.prototype.call, Array.prototype.forEach),
	objectKeys = Object.keys || _objectKeys;

function replace( str, args ) {
	return str.replace( /\{(\d+)\}/g, function( _, n ) { return args[parseInt(n)]; } );
}

function extend( cons, proto ) {
	cons.prototype = proto;
	return cons;
}

var bind = Function.prototype.bind
	? function bind( o, m ) { return m.bind(o); }
	: function bind( o, m ) { return function(){ return m.apply( o, arguments ); } }

var mix2 = dojo && dojo.mixin || function mix2( to, from ) {
	forEach( 
		objectKeys( from ),
		function( k ) { to[k] = from[k]; } 
	);
	return to;
}

// Copied from compile.js to avoid an unnecessary dependency
function stringLiteral( s ) {	
	return '"' + s.toString().replace( /[\\"\r\n\t]/g, function(x){ return { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\t': '\\t', '\r': '' /* Thank you, Bill Gates! */ }[x]; } ) + '"';
}

function copyArguments( args, offs ) {
	return Array.prototype.slice.call( args, offs || 0 );
}

//
//	Meta-compiler for grammar definitions
//

function cacheKey( /* ... */ ) {
	return copyArguments( arguments ).join( '\uffff' );
}

//	Matcher function: this.matcher() -> { in_pri:, out_pri:, out_mode: } or null

var maker_cache = {};

function makeRule( before, in_pri, out_pri, out_mode ) {

	function make() {

		var	pos = 0, last_arg, body = [];

		function checkLiteral( offs ) {
			if( offs>pos )	body.push( 
				replace( 'if(this.top({0}).t!=={1})return false;', [ "{0}", stringLiteral( before.substring( pos, offs ) ) ] )
			);
		}

		before.replace( /[#@]/g, function( arg, offs ) {
			checkLiteral( offs );
			pos = offs + arg.length;
			body.push( replace( 'if(this.top({0}).m!=="{1}")return false;', [ "{0}", last_arg = arg ] ) );
		} );

		checkLiteral( before.length );

		body.reverse();
		body = map( body, function( line, index ){ return replace( line, [ index ] ); } );

		body.unshift( replace( 'if(this.stack.length<{0})return false;', [ body.length ] ) );

		return { 
			matcher: new Function( '', body.join('') + 'return true;' ),
			in_mode: last_arg == '#' && pos == before.length ? '' : last_arg == '@' ? '@' : '#'
		};
	}

	return mix2( 
		{ in_pri: in_pri, out_pri: out_pri, out_mode: out_mode },
		maker_cache[before] || (maker_cache[before] = make())
	);
}

//	Popper function: this.popper() -> undefined (replaces top of the stack)

var popper_cache = {};

function makePopper( before, after ) {

	var cache_key = cacheKey( before, after );
	if( cache_key in popper_cache )	return popper_cache[cache_key];

	var	count = before.replace( /[^#@]+/g, '.' ).length + 1 + (after&&1||0),
		signature = before.replace( /[^#@]/g, '' ) + ':' + after;

	return popper_cache[cache_key] = new Function( '',
		replace( 
			'var callback = this.callback("{0}"), args = this.stack.splice( this.stack.length - {1}, {1} );', 
		   [ signature, count ] 
		) +	replace( 
			'this.pushTerm( callback.apply(this,args), "{0}" );',
			[ after === '@' ? '@' : '#' ]
		)
	);
}

function compileRule( key, rule ) {

	var splits = rule.split( key ),
		before = /^(.*?)(\d+)$/.exec( splits.slice( 0, splits.length-1 ).join( key ) ),
		after = /^(\d+)([#@]?)$/.exec( splits[ splits.length-1 ] );

	if( splits.length < 2 || !before || !after )	throw Error( "BUG -- illegal rule syntax for key " + key + ": " + rule );

	return mix2( 
		{ popper: makePopper( before[1], after[2] ) }, 
		makeRule( before[1], parseInt(before[2]), parseInt(after[1]), after[2] ) 
	);
}

function classifyRules( rules, key ) {
	var result = {};
	forEach( rules, function(r) {
		if( r.in_mode in result ) {
			if( result[r.in_mode].in_pri != r.in_pri )
				throw Error( "BUG -- conflict between rules for key " + key );
		} else {
			result[r.in_mode] = { in_pri: r.in_pri, rules: [] };
		}
		result[r.in_mode].rules.push( r );
	} );
	return result;
}

function compileGrammar( grammar ) {
	var	compiled_grammar = {};
	for( var key in grammar )
		if( grammar.hasOwnProperty(key) ) {
			var rules = [];
			for( var i=0; i<grammar[key].length; ) {
				var rule = compileRule( key, grammar[key][i++] );
				if( i<grammar[key].length && typeof grammar[key][i] === 'function' )
					rule.callback = grammar[key][i++];
				rules.push( rule );
			}
			
			compiled_grammar[key] = classifyRules( rules, key );
		}
	return compiled_grammar;
}

//	Default semantics -- copy the expression as is

function concatEOS( result, eos ) {
	delete eos.t;
	return this.concatAll( result, eos );
}

function unfinishedTernary() {
	throw Error( "Expected :" );
}

function unterminatedString( quote ) {
	throw Error( "Missing " + ( quote == '"' ? 'double' : 'single' ) + " quote" );
}

function unbalancedBracket() {
	throw Error( "Expected " + { '(':')', '[':']', '{':'}' }[ arguments[arguments.length-2] ] );
}

function unterminatedRegexp() {
	throw Error( "Missing /" );
}

function regexpClose() {
	this.regexp = '>';
	return this.concatAll.apply( this, arguments );
}

//	Default Javascript expression grammar: extended without copying

var	js_expr_grammar = compileGrammar({
	'(':	[ '#80(1#', unbalancedBracket, '80(1#', unbalancedBracket ],
	')':	[ '#(#2)99', '#(2)99', '(#2)99' ],
	'[':	[ '#90[1#', unbalancedBracket, '90[1#', unbalancedBracket ],
	']':	[ '#[#2]99', '[#2]99', '[2]99' ],
	'{':	[ '90{1#', unbalancedBracket ],
	'}':	[ '{#2}99', '{2}99' ],

	',':	[ '#5,5#' ],

	'?':	[ '#16?10#', unfinishedTernary ],
	':':	[ '#?#11:10#', '#11:6#' ],

	'=':	[ '#16=15#' ],	'+=':	[ '#16+=15#' ],	'-=':	[ '#16-=15#' ],
	'*=':	[ '#16*=15#' ],	'/=':	[ '#16/=15#' ],	'%=':	[ '#16%=15#' ],	
	'|=':	[ '#16|=15#' ],	'&=':	[ '#16&=15#' ],	'^=':	[ '#16^=15#' ],	
	'<<=':	[ '#16<<=15#' ],'>>=':	[ '#16>>=15#' ],'>>>=':	[ '#16>>>=15#' ],	

	'&':	[ '#40&40#' ],	'&&':	[ '#25&&25#' ],
	'|':	[ '#30|30#' ],	'||':	[ '#20||20#' ],
	'^':	[ '#35^35#' ],

	'==':	[ '#45==45#' ],	'===':	[ '#45===45#' ],
	'!=':	[ '#45!=45#' ],	'!==':	[ '#45!==45#' ],

	'<':	[ '#50<50#' ],	'<=':	[ '#50<=50#' ],	
	'>':	[ '#50>50#' ],	'>=':	[ '#50>=50#' ],	

	'in':			[ '#50in50#' ],
	'instanceof':	[ '#50instanceof50#' ],

	'<<':	[ '#55<<55#' ],	'>>':	[ '#55>>55#' ],	'>>>':	[ '#55>>>55#' ],

	'*':	[ '#65*65#' ],	'%':	[ '#65%65#' ],

	'/':	[ '#65/65#', '/@2/100', regexpClose, '100/1@', unterminatedRegexp ],	

	'+':	[ '71+70#', '#60+60#' ],	'-':	[ '71-70#', '#60-60#' ],

	'!':	[ '71!70#' ],	'~':	[ '71~70#' ],

	'typeof':	[ '71typeof70#' ],
	'void':		[ '71void70#' ],
	'delete':	[ '71delete70#' ],

	'++':	[ '#75++100', '71++70#' ],	'--':	[ '#75--100', '71--70#' ],

	'new':	[ '85new86#' ],

	'.':	[ '#95.95#' ],

	'"':	[ '"@2"100', '100"1@', unterminatedString ],
	"'":	[ "'@2'100", "100'1@", unterminatedString ],
	'\\':	[ '@99\\99@' ],

	'<<Number>>': 		[ '100<<Number>>100' ],
	'<<Identifier>>': 	[ '100<<Identifier>>100' ],
	'<<EOS>>':			[ '#0<<EOS>>0', concatEOS, '@0<<EOS>>0' ]
});

var Term = extend(
	function( init, rule ) {
		mix2( this, init );
		if( rule )
			this.r = rule;
	}, {
		toString: function() {
			return this.t ? this.t.toString() : this.s.substr( this.p, this.l );
		},

		merge: function( r ) {
			if( 'l' in this && 'l' in r ) {
				if( this.t ) delete this.t;
				this.l = r.l + ( r.p - this.p );
				return true;
			}
			return false;
		}
	}
);

var TermList = extend(
	function( first ) {
		this.tl = [ first ];
	}, {
		toString: function() { return this.tl.join(''); },
	
		merge: function( t ) {
			var last;

			if( t.tl ) {
				if( (last = this.tl[this.tl.length-1]).merge && last.merge( t.tl[0] ) )
					t.tl.shift();
				this.tl.push.apply( this.tl, t.tl );
			} else if( !((last = this.tl[this.tl.length-1]).merge && last.merge( t )) )
				this.tl.push( t );

			return true;
		}
	}
);

var Parser = extend( 
	function( grammar, src ) {
		this.stack = [];
		this.mode = '#';
		this.grammar = grammar;
		this.src = src;
		this.first = true;
	}, {
		top: function( n ){ 
			return this.stack[ this.stack.length-1-(n||0) ]; 
		},

		rule: function( n ){ return this.top(n).r || {}; },

		priority: function( n ){ return this.rule(n).out_pri || 0; },

		callback: function( signature ){ 
			return this.rule( signature.length - signature.indexOf( ':' ) - 1 ).callback || this.concatAll;
		},

		concatAll: function( first ){
			var tl;
			for( var i=1; i<arguments.length; ++i )
				if( tl )
					tl.merge( arguments[i] );
				else if( !first.merge || !first.merge( arguments[i] ) )
					(tl = new TermList( first )).merge( arguments[i] );

			return tl || first;
		},
		
		pushTerm: function( term, mode ) {
			term.m = mode;
			this.stack.push( term );
		},

		comments: { '/*' : '*/', '//' : '\n' },

		push: function( token, pos, len ) {

			if( this.comment ) {
				if( token === this.comments[ this.comment ] )
					delete this.comment;
				return;
			} else if( this.regexp === '>' ) {
				delete this.regexp;
				if( /[a-z]+/.test( token ) ) {
					this.top().l += len;
					return;
				}
			} else	if( this.mode !== '@' ) {
				if( token in this.comments ) {
					this.comment = token;
					return;
				}
				if( token === '*/' ) {
					this.push( '*', pos, 1 );
					++pos; len = 1; token = '/';
				}
			} else if( token === '\n' )
				token = '<<EOS>>';
			else if( this.regexp === '[' ) {
				if( token === ']' )
					this.regexp = '<';
				else
					token = '';
			} else if( this.regexp && token === '[' )
				this.regexp = '[';

			var rules = this.grammar[token], rule;

			if( !rules ) {
				if( /^\.?[0-9]/.test( token ) )			
					rules = this.grammar['<<Number>>'];
				else if( rules = this.grammar[token.charAt(0)] )
					;
				else if( /^[a-z_$]/i.test( token ) )
					rules = this.grammar['<<Identifier>>'];
			}

			rules = rules && rules[this.mode];
			if( !rules ) {
				this.skip( pos, len );
				return;
			}

			var	look_at = this.mode == '#' ? 0 : 1;			
			while( this.stack.length > look_at && this.priority( look_at ) >= rules.in_pri )
				this.pop( look_at );

			if( rules ) for( var i=0; i<rules.rules.length; ++i ) {
				if( (rule = rules.rules[i]).matcher.call( this ) )
					break;
				rule = null;
			}

			if( this.first ) {
				len += pos;
				pos = 0;
				delete this.first;
			}

			if( rule ) {
				this.pushTerm( new Term( { t: token, p: pos, l: len, s: this.src }, rule ), ' ' );				
				if( !(this.mode = rule.out_mode) )
					this.pop();
				else if( this.mode == '@' )	{
					if( token === '/' )		
						this.regexp = '<';
					this.pushTerm( new Term( { p: pos+len, l: 0, s: this.src } ), '@' );
				}
			} else {
				if( this.stack.length > look_at )	this.pop( look_at ); // A chance at a better error message
				throw Error( 'Unbalanced ' + token );
			}				
		},

		pop: function( n ) {
			var popper = this.rule(n).popper;
			if( popper )	popper.call( this );
		},

		skip: function( pos, len ) {

			if( this.regexp === '>' )
				delete this.regexp;

			var chars;
			if( this.mode === '@' )	
				this.top().l += len;
			else if( !/^\s+$/.test( chars = this.src.substr( pos, len ) ) )	
				throw Error( 'Expected ' + ( this.mode=='#' ? 'operand' : 'operator' ) + ' instead of ' + chars );
		}
	}
);

function buildParser( options ) {

	var	scanner, scanner_regex;

	if( options && options.scanner ) {
		if( typeof options.scanner === 'function' )	scanner = options.scanner;
		else	scanner_regex = typeof options.scanner === 'string' ? new RegExp( options.scanner, 'g' ) : options.scanner;
	} else	scanner_regex = // Default Javascript scanner: copy and modify it to extend the expression grammar with new token types
		/(?:[\n"'(),:;?\[\]{}~]|\\.|[%\^]=?|\*[\/=]?|\/[\/*=]?|[!=](?:==?)?|\+[+=]?|-[\-=]?|&[&=]?|\|[|=]?|>{1,3}=?|<<?=?|\.\d+(?:e[+\-]?\d+)?|(?!0x)\d+(?:\.\d*(?:e[+\-]?\d+)?)?|\.(?!\d)|0x[0-9a-f]+|[a-z_$][a-z_$0-9]*)/ig;
		//     one-char tokens  esc op/op=..ops/comments...... eq/ne..... op/opop/op=...................... comp=/shift=.. decimal from dot.... decimal starting with digit....... dot..... hexadecimal identifier........

	if( !scanner )	scanner = function( str, on_token, on_skip ) { 
		var pos = 0;
		try {
			str.replace( scanner_regex, function( token, offs ) { 
				if( offs > pos )	on_skip( pos, offs-pos );
				on_token( token, offs, token.length );
				pos = offs + token.length;
				return '';
			} );
			if( pos < str.length )	on_skip( pos, str.length - pos );
		} catch( e ) {
			e.message += ' after ' + str.substring( 0, pos );
			throw e;
		}
	}

	var grammar = mix2( mix2( {}, js_expr_grammar ), compileGrammar( options && options.grammar || {} ) );

	function body( src ) {
		var parser = new Parser( grammar, src );
		scanner( src, bind( parser, parser.push ), bind( parser, parser.skip ) );
		try {		
			parser.push( '<<EOS>>', src.length, 0 );
		} catch( e ) {
			e.message += ' after ' + src;
			throw e;
		}
		return parser.stack.pop();
	}

	return body;
}

function parseExpression( options, src ) {
	var parser = buildParser( options );
	return src ? parser( src ) : parser;
}

try {
	dojox.jtlc.parseExpression = parseExpression;
} catch( e ) {}

try {
	module.exports = parseExpression;
} catch( e ) {}

})();
