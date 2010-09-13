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

var	dj = dojox.jtlc;

dojo.declare( 'dojox.jtlc.qplus', dojox.jtlc.JXL, {

	string: function( value ) {
		this.compile(
			this.loop && !this.loop.started() ? 
				this.tags.query( value ) : 
				this.tags.expr( value )
		);
	},

	parse: function( query, multiple ) {

		var	delims = { ',': '\uffff', '|': '\ufffe' },
			brackets = {
				'[': { close: ']', allow: '[]({"\'' },
				'(': { close: ')', allow: '[(){"\'' },
				'{': { close: '}', allow: '[({}"\'' },
				'"': { close: '"', allow: '"' },
				"'": { close: "'", allow: "'" }
			},
			stack = [ { close: '', allow: '[](){}"\'|,' } ],

			prep = query.replace( multiple ? /[\[\](){}"'|,]/g : /[\[\](){}"'|]/g,
				function( c ) {
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

		if( multiple )	return dojo.map( 
			prep.split( delims[','] ),
			function( p ) { return this._parseList( p.split( delims['|'] ) ); },
			this
		); 
		else return this._parseList( prep.split( delims['|'] ) );
	},

	_parseList: function( list ) {
		var	result = null;
		while( list.length ) {
			var	item = list.shift();
			if( /^\s*([a-z_]\w*(?:\s*[.]\s*[a-z_]\w*)*)\s*([:].*)?$/i.exec( item ) && (result||RegExp.$2) ) {
				result = 
					RegExp.$2 ? this._makeTag( RegExp.$1, RegExp.$2.substr(1), result ) :
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

	_makeTag: function( tag, arg1, arg2 ) {

		var	args = [];
		if( arg1 ) {
			args.push( arg1 );
			if( arg2 )	args.push( arg2 );
		}

		tag = tag.split( /\s*[.]\s*/ );
	
		if( tag.length==1 ) {

			var	t;

			if( (t = this.tags[tag[0]]) || (t = dj.tags[tag[0]]) )
				return t.apply( null, args );
			else if( t = this.filters[tag[0]] ) {
				if( typeof t === 'function' ) {
					args.unshift( t );
					return dojox.jtlc.tags.bind.apply( null, args );
				} else if( typeof t === 'string' ) {
					if( args.length == 1 )
							return dojox.jtlc.tags.expr( t, args[0] );
					else	return dojox.jtlc.tags.expr( t, dojox.jtlc.tags.expr( args[1], args[0] ) );
				} else
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
			if( arguments.length <= 2 )
				for( var i=1; i<10; ++i )
					this.args.push( dojox.jtlc.tags.arg( i ) );
		}

	} ) );

	djqp._declareTag( 'query', dojo.declare( dj.tags._query, {
	
		constructor: function() {
			if( arguments.length <= 2 && this.query.match( /[$][1-9]/ ) )
				this.dynamicArgs = true;
		},

		callQuery: function( self ) {

			if( !self.dynamicArgs )	
				return dj.tags._query.prototype.callQuery.call( this, self );

			this.compile( self.args[0] );

			var	v =	this.popExpression(),
				t = this.addLocal();

			this.code.push( t + '=[' + v + '].concat($.slice(1));' );

			return this.addGlobal( this.queryLanguage( self.query ) ) + '.apply(null,' + t + ')';
		}

	} ) );

})( dojox.jtlc.qplus.prototype );

