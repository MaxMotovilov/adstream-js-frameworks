// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/dojox.jtlc/wiki/License

dojo.provide( "dojox.jtlc.qplus" );

dojo.require( "dojox.jtlc.JXL" );

/* 
	JSON Query plus: linearized syntax for a subset of JXL stylesheets:

	<PipeList> ::= <Pipe> { "," <Pipe>... }
	<Pipe>     ::= <FirstAction> { "|" <Action>... }
	<Action>   ::= <Tag> [ ":" <Parameter> ]
	<FirstAction>::= <Parameter> | <DefiniteAction>
	<DefiniteAction>::= <Tag> ":" <Parameter>
	<Tag>	   ::= <Identifier> { "." <Identifier>... }
				   <<JXL tag or one of the configured tags and/or filters or a global function name>>
	<Parameter>::= <Expression> | <Query>
				   <<Unparsed string>>

	qplus cannot represent nested bodies (as in each() or group()) or nodes with more than two arguments.
	
	To configure filters, use 'filters' property in the settings object passed into constructor:

		{ filters: { filt_fn: function(x){...}, filt_expr: "expression" } }

	Functional filters are called via bind(), string filters are expanded inline via expr(). 

	It is also possible to refer to global functions and object methods using the qualified identifier
	syntax in the qplus tag:

		{ <NamespaceID> "."... } <Function>
		{ <NamespaceID> "."... } <Constructor> "." <Method>

	Note that the 2nd notation is not a correct Javascript name for the method; it is translated inline into

		Constructor( parameter ).Method()

	for all object types except Object, Array and String.
*/

(function() {

var	dj = dojox.jtlc, d = dojo;

function parseConstant( str ) {
	if( /^\s*-?\d+(\.\d*)?([eE]-?\d+)?\s*$/.exec( str ) )
		return RegExp.$2 || RegExp.$3 ? parseFloat( str ) : parseInt( str );
	if(	/^\s*(true|false)\s*$/.exec( str ) )
		return RegExp.$1 === 'true';
	return str;
}

d.declare( 'dojox.jtlc.qplus', dj.JXL, {

	string: function( value ) {
		this.compile(
			this.loop && !this.loop.started() ? 
				this.tags.query( value ) : 
				this.tags.expr( value )
		);
	},

	_exprBrackets: {
		'[': { close: ']', allow: '[]({"\'' },
		'(': { close: ')', allow: '[(){"\'' },
		'{': { close: '}', allow: '[({}"\'' },
		'"': { close: '"', allow: '"' },
		"'": { close: "'", allow: "'" }
	},

	_singleScanRegex: /(?:[\[\](){}"'|]|\\.)/g,
	_multipleScanRegex: /(?:[\[\](){}"'|,]|\\.)/g,
	_initScanStack: { close: '', allow: '[](){}"\'|,' },

	parse: function( query, multiple ) {

		var	delims = { ',': '\uffff', '|': '\ufffe' },
			stack = [ this._initScanStack ],
			brackets = this._exprBrackets,
			prep = query.replace( 
				multiple ? this._multipleScanRegex : this._singleScanRegex,
				function( c ) {
					if( c[0] == '\\' ) return c[1];
					if( stack[0].allow.indexOf( c ) >= 0 ) {
						if( c == stack[0].close )
							stack.shift();
						else if( c in brackets )
							stack.unshift( brackets[c] );
						else if( c in delims )	
							return delims[c];
					}
					return c;
				}
			);

		if( stack.length > 1 )	
			throw Error( 'Unbalanced delimiters -- expected ' + dj.stringLiteral( stack[0].close ) );

		if( multiple )	return d.map( 
			prep.split( delims[','] ),
			function( p ) { return this._parseList( p.split( delims['|'] ) ); },
			this
		); 
		else return this._parseList( prep.split( delims['|'] ) );
	},

	_parseList: function( list ) {
		var	result;
		while( list.length ) {
			var	item = list.shift();
			if( /^\s*([a-z_]\w*(?:\s*[.]\s*[a-z_]\w*)*)\s*([:](?:.|\n)*)?$/i.exec( item ) && (result||RegExp.$2) ) {
				result = 
					RegExp.$2 ? this._makeTag( RegExp.$1, this._parseOwnArg( RegExp.$2.substr(1) ), result ) :
								this._makeTag( RegExp.$1, result );
			} else if( result ) {
				throw Error( "Tag is not specified in '" + item + "'" );
			} else {
				// String constant will be mapped to expr() or query() during compilation
				result = item;
			}
		}
		return result;
	},

	_parseOwnArg: function( str ) {
		if( /^\[\s*(.*?)\s*\]$/.exec( str ) ) try {
			var	delims = { ',': '\uffff' },
				stack = [ this._initScanStack ],
				brackets = this._exprBrackets,
				prep = RegExp.$1.replace( 
					this._multipleScanRegex,
					function( c ) {
						if( c[0] == '\\' ) return c[1];
						if( stack[0].allow.indexOf( c ) >= 0 ) {
							if( c == stack[0].close )
								stack.shift();
							else if( c in brackets )
								stack.unshift( brackets[c] );
							else if( c in delims )	
								return delims[c];
							else if( stack.length == 1 && c == ']' )
								throw true; // As long as it is not an Error							
						} 
						return c;
					}
				),
				args = prep.split( /\s*\uffff\s*/ );

			if( stack.length == 1 )	return d.map( args, parseConstant );		
			
		} catch( e ) {
			if( e instanceof Error )	throw e;
		} else return parseConstant( str );

		return str;
	},

	_makeTag: function( tag, arg1, arg2 ) {

		var	args = [], reverse_if_tag = true;
		if( arg1 ) {
			if( arg2 )	args.push( arg2 );
			args.push( arg1 );
		}
		
		if( args[args.length-1] instanceof Array ) {
			if( args.length > 1 )
				throw Error( tag + ":[" + args[1] + "] can only be used as the leftmost element" );
			reverse_if_tag = false;
			args = args[0];
		}

		tag = tag.split( /\s*[.]\s*/ );
	
		if( tag.length==1 ) {

			var	t;

			if( (t = this.tags[tag[0]]) || (t = dj.tags[tag[0]]) ) {
				if( reverse_if_tag ) args.reverse();
				return t.apply( null, args );
			} else if( t = this.filters[tag[0]] ) {
				args.unshift( t );
				if( typeof t === 'function' )
					return dojox.jtlc.tags.bind.apply( null, args );
				else if( typeof t === 'string' )
					return dj.tags.expr.apply( null, args );
				else
					throw Error( "Filter '" + tag[0] + "' is neither string nor function" );
			}
		}

		var	method = dojo.getObject( tag.join( '.' ) );
		if( typeof method === 'function' ) {
			var constr = tag.length > 1 && dojo.getObject( tag.slice( 0, tag.length-1 ).join( '.' ) );
			if( typeof constr === 'function' ) {
				if( constr === String )
					args.unshift( '$.toString().' + tag[ tag.length-1 ] );
				else if( constr === Array || constr === Object )
					args.unshift( '$.' + tag[ tag.length-1 ] );
				else
					args.unshift( tag.slice( 0, tag.length-1 ).join( '.' ) + '($).' + tag[ tag.length-1 ] );
			} else	args.unshift( tag.join( '.' ) + '($)' );
			
			return dojox.jtlc.tags.expr.apply( null, args );
		}
		
		throw Error( "Unknown filter or tag: '" + tag.join( '.' ) + "'" );
	},

	tags: {},	//	Populated with calls to _declareTag()

	_declareTag: dj._declareTag,

	filters: {
		lower: '$.toString().toLowerCase()', 
		upper: '$.toString().toUpperCase()'
	}
});

})();

(function( djqp ) {

	var	dj = dojox.jtlc;

	djqp._declareTag( 'expr', dojo.declare( dj.tags._expr, {
	
		constructor: function() {
			for( var i=Math.max(1,arguments.length-1); i<10; ++i )
				this.args.push( dojox.jtlc.tags.arg( i ) );
		}

	} ) );

	djqp._declareTag( 'do', dojo.declare( djqp.tags._expr, {

		constructor: function() {
			if( /^\{((?:.|\n)*?);?\s*\}$/.exec( this.expr ) )
				this.expr = RegExp.$1;
			this.expr = '(function(){' + this.expr + ';return $;})()';

			this.simplify = arguments.length <= 1 ? this._simplify : this._cant_simplify;			
		},

		_simplify: function() {
			this.expr = this.expr.replace( /;return \$;\}\)\(\)$/, '})()' );
		},
	
		_cant_simplify: function() {}
	} ) );

	djqp._declareTag( 'query', dojo.declare( dj.tags._query, {
	
		constructor: function() {
			if( arguments.length <= 2 && this.query.match( /[$][1-9]/ ) )
				this.dynamicArgs = true;
		},

		callQuery: function( self ) {

			if( !self.dynamicArgs )	
				return dj.tags._query.prototype.callQuery.call( this, self );

			if( this.loop )
				this.nonAccumulated( function() {
					this.compile( self.args[0] );
				} );
			else	this.compile( self.args[0] );

			var	v =	this.popExpression(),
				t = this.addLocal();

			this.code.push( t + '=' + this.addGlobal( dj._copyArguments ) + '($);' );
			this.code.push( t + '[0]=' + v + ';' );

			return this.addGlobal( this.queryLanguage( self.query ) ) + '.apply(null,' + t + ')';
		}

	} ) );

})( dojox.jtlc.qplus.prototype );

