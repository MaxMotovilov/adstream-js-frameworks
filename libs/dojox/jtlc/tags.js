dojo.provide( "dojox.jtlc.tags" );

dojo.require( "dojox.jtlc.compile" );

dojox.jtlc.replaceWithinJavascript = function( s, context, repl ) 
{
	return s.replace( /((?:.|\n)*?)((["']).*?[^\\]?\2|$)/g, function( _1, code, trailing ) {
		return code.replace( context, repl ) + trailing;
	} )
}

dojox.jtlc._copyArguments = function( args, all_but )
{
	return Array.prototype.slice.call( args, all_but || 0 );
}

dojox.jtlc.tags = {}

dojox.jtlc._declareTag = function( name, proto_or_class, make_constructor ) {
	var cls = typeof proto_or_class === 'function' ? proto_or_class : dojo.declare( null, proto_or_class );
	this.tags['_'+name] = cls;
	this.tags[name] = make_constructor ?
		make_constructor( cls ) :
		function() { 
			var t = dojo.delegate( cls.prototype );
			cls.apply( t, arguments ); 
			return t;
		};
}

/* All tags follow the visitor pattern: their compile() method is executed
   bound to the compiler instance and the tag object is passed in as its
   first argument */

/* many( tpl ) -- establishes loop context over tpl if one is 
   not already there */

dojox.jtlc._declareTag( 'many', {

	constructor: function( tpl ) {
		if( arguments.length != 1 )	
			throw Error( "many() requires exactly one argument" );
		this.template = tpl;
	},

	compile: function( self ) {
		if( !this.sink )
			throw Error( "Cannot use many() outside the context of an array or an object literal" );

		if( this.loop )	
			this.compile( self.template );
		else {
			this.accumulated( null, this.sink, new dojox.jtlc._Loop( this ), function() {
				this.compile( self.template );
			} );
		}
	}
} );

/* one( tpl ) -- evaluates tpl as a singleton even within a loop context */

dojox.jtlc._declareTag( 'one', {

	constructor: function( tpl ) {
		if( arguments.length != 1 )	
			throw Error( "one() requires exactly one argument" );
		this.template = tpl;
	},

	compile: function( self ) {
		if( !this.loop )
			this.compile( self.template );
		else {
			this.nonAccumulated( function() {
				this.compile( self.template );
			} );
		}
	}
} );

/* quote( value ) -- returns value as stored in the template */

dojox.jtlc._declareTag( 'quote', {

	constructor: function( value ) {
		if( arguments.length != 1 )	
			throw Error( "quote() requires exactly one argument" );
		this.value = value;
	},

	compile: function( self ) {
		switch( typeof self.value ) {
			case 'boolean': case 'number':
				this.expressions.push( self.value.toString() );
				break;
			case 'string':
				this.expressions.push( dojox.jtlc.stringLiteral(self.value.toString()) );
				break;
			default:
				this.expressions.push( this.addGlobal( self.value ) );
		}
	}
} );

/* current() -- returns current input or serves as a generator */

dojox.jtlc._declareTag( 'current', {
	compile: function() {
		this.generator();
	}
} );

/* arg( index ) -- returns the argument passed into compiled template. */

dojox.jtlc._declareTag( 'arg', {

	constructor: function( index ) {
		if( arguments.length != 1 )	
			throw Error( "arg() requires exactly one argument" );
		this.index = index;
	},

	compile: function( self ) {
		this.expressions.push( '$[' + self.index.toString() + ']' );
	}
} );

/* acc( tpl ) -- stores the argument in a variable so expressions referencing
   it may use side effects */

dojox.jtlc._declareTag( 'acc', {

	constructor: function( tpl ) {
		if( arguments.length != 1 )	
			throw Error( "tpl() requires exactly one argument" );
		this.arg = tpl;
	},

	compile: function( self ) {
		this.compile( self.arg );
		var	value = this.popExpression(),
			t = this.addLocal();
		if( t != value )	this.code.push( t + '=' + value + ';' );
		this.expressions.push( t );
	}
} );

/* replace( format [, arg ] ) -- builds string based on the format
   specification from compile(arg)(input) or from the current object or arg(0) */

dojox.jtlc._declareTag( 'replace', {
	constructor: function( format, arg ) {
		if( typeof format !== 'string' )
			throw Error( "replace() expects formatting string, not " + format.toString() );
		this.format = format;
		if( arg )	this.arg = arg;
	},

	compile: function( self ) {
		this._replaceFunction = this._replaceFunction || this.addGlobal( this.replaceLanguage );

		if( self.arg )	this.compile( self.arg );
		else			this.generator();

		this.expressions.push( 
			this._replaceFunction + '(' + dojox.jtlc.stringLiteral(self.format) + ',' + this.popExpression() + ')'
		);
	}
} );

/* each( tpl0 [, tpl1 ... tplN ) -- creates nested loops by 
   evaluating each template as a generator within the context
   of the previous one, right to left. If there is only tpl0
   then it is evaluated in the context of current input (treated
   as generator) */

dojox.jtlc._declareTag( 'each', {

	constructor: function( inner, outer ) {
		this.inner = inner;
		this.outer = outer;
	},

	compile: function( self ) {
		
		if( !this.loop )
			throw Error( "each() is never a singleton, wrap it in many() or []" );

		if( this.loop.started() )
			throw Error( "each() used in a wrong context" );

		this.compile( self.outer );

		if( !this.loop.started() )
			throw Error( "All arguments of each() must be generators" );
		
		this.loop.lockItem( this.popExpression() );

		this.accumulated( null, this.sink, new dojox.jtlc._Loop( this ), function() {
			this.compile( self.inner );
		} ); 
	}

}, function( cls ) {
	return function() {
		if( arguments.length == 0 )
			throw Error( "each() requires at least one argument" );
		else if( arguments.length == 1 )
			return new cls( arguments[0], dojox.jtlc.tags.current() );
		else {
			var	last = arguments[arguments.length-1];
			for( var i=arguments.length-2; i >= 0; --i )
				last = new cls( arguments[i], last );
			return last;
		}
	}
} );

/* Common code for the multi-argument tags */

dojo.declare( 'dojox.jtlc._MultiArgTag', null, {

	constructor: function( /* first, args... */ ) {
		if( arguments.length > 1 )	
				this.args = dojox.jtlc._copyArguments( arguments, 1 );
		else	this.args = [ dojox.jtlc.tags.current() ];
	},

	argumentList: function( self ) {
		var n = self.args.length, r = [];
		while( n-- )	r.push( this.popExpression() );
		return r.join( ',' );
	},

	compileArgs: function( self, exclude_first ) {

		this.nonAccumulated(
			function() {
				for( var i=self.args.length-1; i >= (exclude_first ? 1 : 0); --i )
					this.compile( self.args[i] );
			}
		);
		
		if( exclude_first )	this.compile( self.args[0] );
	}
} );

/* expr( expr [, arg0 ... argN ] ) -- evaluates a Javascript expression. 

   In singleton mode (no loop), $0...$9 are replaced with arg0...arg9.
   $ is a synonym to $0.

   Within a loop, $0...$9 are still replaced with arg0...arg9; arg0 
   (which defaults to current input if omitted) serves as a generator.
   $ is replaced with the currently generated value.

   If expression contains no references and begins with an identifier,
   it is assumed the latter is a member reference on $ (i.e. '$.' is
   prepended to the expression).
*/

dojox.jtlc._declareTag( 'expr', dojo.declare( dojox.jtlc._MultiArgTag, {

	constructor: function( expr ) {

		if( typeof expr !== 'string' )
			throw Error( "expr() expects a string, not " + expr.toString() );

		this.expr = dojo.trim( expr );

		if( this.expr == dojox.jtlc.replaceWithinJavascript( this.expr, /\$/g, '' ) &&
			/^[a-z_]/.test( this.expr ) )
			this.expr = "$." + this.expr;
	},

	saveExpression: function( self, refs, i ) {

		var	expr = this.expressions[ this.expressions.length-1 ];

		if( refs[i] > 1 &&
			expr.length > 4
			/* Assume that anything shorter than 4 characters is safe to re-evaluate */
//			&& expr != this.current_input 
			/* and do not thwart the optimizer when working with current expressions! */
		) {
			var t = this.addLocal();
			this.code.push( t + '=' + expr + ';' );
			expr = this.expressions[ this.expressions.length-1 ] = t;
		} else if( expr.length > 4 )	expr = '('+expr+')';
		
		refs[i] = expr;
	},	

	compile: function( self ) {

		var	refs = {}, any_refs = false, expr = self.expr;

		dojox.jtlc.replaceWithinJavascript( self.expr, /\$[0-9#]?/g, function(s){ 
			if( !( s in refs ) )	refs[s] = 1;
			else					++refs[s];
			any_refs = any_refs || s in { '$':1, '$#':1 };
		} );

		if( !any_refs && this.loop && !this.loop.started() )
			throw Error( "Expression " + dojox.jtlc.stringLiteral(self.expr) + " cannot be used as a generator" );

		if( '$#' in refs && !this.loop )
			throw Error( "$# cannot be used in singleton expressions" );

		var	old_expr_length = this.expressions.length;

		if( '$0' in refs )	refs['$0'] = this.current_input;

		this.nonAccumulated( function() {
			for( var i in refs ) 
				if( !( i in { '$':1, '$#': 1, '$0':1 } ) ) {
					var n = parseInt( i.charAt(1) );
					if( self.args.length <= parseInt(n) )
						throw Error( "Expression " + dojox.jtlc.stringLiteral(self.expr) + " refers to argument " + i + " that was not supplied" );
					this.compile( self.args[ n ] );
					self.saveExpression.call( this, self, refs, i );
				}
		} );

		if( this.loop && !this.loop.started() || '$' in refs ) {
			this.compile( self.args[0] );
			if( !('$' in refs) )
				this.popExpression();
			else
				self.saveExpression.call( this, self, refs, '$' );
		}

		if( '$#' in refs )
			refs['$#'] = this.loop.count();

		while( this.expressions.length > old_expr_length )
			this.popExpression();

		this.expressions.push( dojox.jtlc.replaceWithinJavascript( self.expr, /\$[0-9#]?/g, function(s) { 
			return refs[s]
		} ) );
	}
} ) );

/* from( [tpl] ) -- turns an array or dictionary expression into a generator of values */

dojox.jtlc._getValues = function( d ) {
	if( d instanceof Array )	return d;
	var res = [];
	for( var i in d )
		if( d.hasOwnProperty(i) )
			res.push( d[i] );
	return res;
}

dojox.jtlc._declareTag( 'from', {
	constructor: function( tpl ) {
		this.template = tpl || dojox.jtlc.tags.current();
	},

	compile: function( self ) {

		this._valueGenerator = this._valueGenerator || this.addGlobal( dojox.jtlc._getValues );

		if( !this.loop )
			throw Error( "from() is never a singleton, wrap it in many() or []" );

		if( this.loop.started() )
			throw Error( "from() used in a wrong context" );

		this.nonAccumulated( function() {
			this.compile( self.template );
		} );

		this.generator( this._valueGenerator + '(' + this.popExpression() + ')' );
	}
} );

/* keys( [tpl] ) -- turns an array or dictionary expression into a generator of keys */

dojox.jtlc._getDictionaryKeys = function( d ) {
	var res = [];
	for( var i in d )
		if( d.hasOwnProperty(i) )
			res.push(i);
	return res;
}

dojox.jtlc._declareTag( 'keys', {
	constructor: function( tpl ) {
		this.template = tpl || dojox.jtlc.tags.current();
	},

	compile: function( self ) {

		this._keyGenerator = this._keyGenerator || this.addGlobal( dojox.jtlc._getDictionaryKeys );
		var	gen_mode = false;

		if( this.loop && !this.loop.started() ) {
			var	_this = this, _loop = this.loop;
			this.loop = dojo.delegate( this.loop, {
				begin: function( init ) {
					_loop.begin( _this._keyGenerator + '(' + init + ')' );
				}
			} );
			gen_mode = true;
		}

		this.nonAccumulated( function() {
			this.compile( self.template );
		} );

		if( gen_mode ) 
			this.generator( this.popExpression() );
		else
			this.expressions.push( this._keyGenerator + '(' + this.popExpression() + ')' );
	}
} );

/* setkey( [template [, source ]] ) -- sets the dictionary key to
   a value returned by template. Template is typically a combination
   of replace() and expr() which is evaluated over source (defaults 
   to current input). Returned value is the same as source */

dojox.jtlc._declareTag( 'setkey', {

	constructor: function( key, arg ) {
		if( typeof key === 'undefined' )
			throw Error( "setkey() requires at least one argument" );

		this.key = key;
		this.arg = arg || dojox.jtlc.tags.current();
	},

	compile: function( self ) {
		this.compile( self.arg );

		if( !this.sink || !this.sink.key )
			throw Error( "setkey() should only be used within an object literal" );

		var input = this.popExpression(),
			t = this.addLocal();

		if( t != input )	this.code.push( t + '=' + input + ';' );

		this.nonAccumulated( function() {
			this.compile( self.key );
		}, t );

		this.sink.key = this.popExpression();				
		this.expressions.push( t );
	}
} );

/* bind( fn [, arg0 ... argN] ) -- outside a loop produces the
   code for fn( compile(arg0)(input), ... compile(argN)(input) ).

   First argument (defaults to current input if absent) is a generator
   within the loop, the rest are evaluated once.
*/

dojox.jtlc._declareTag( 'bind', dojo.declare( dojox.jtlc._MultiArgTag, {

	constructor: function( fn ) {
		if( typeof fn !== 'function' )
			throw Error( "First argument of bind() must be a function" );
		this.fn = fn;
	},

	compile: function( self ) {
		var fn = this.addGlobal( self.fn );
		self.compileArgs.call( this, self, true );
		this.expressions.push( fn + '(' + self.argumentList.call( this, self ) + ')' );
	}
} ) );

/* last( [tpl] ) -- returns last element of the generated sequence */

dojo.declare( 'dojox.jtlc._LastSink', dojox.jtlc._Sink, {

	constructor: function() {
		this.accumulator = this.compiler.addLocal();
	},

	append: function() {
		this.compiler.code.push( this.accumulator + '=' + this.compiler.popExpression() + ';' );
		this.closeLoops();
	}
} );

dojox.jtlc._declareTag( 'last', {
	constructor: function( tpl ) {
		this.arg = tpl || dojox.jtlc.tags.current();
	},

	compile: function( self ) {
		this.accumulated( null, new dojox.jtlc._LastSink( this ), new dojox.jtlc._Loop( this ), function() {
			this.compile( self.arg );
			this.sink.append();
		} );
	}
} );

/* defined( [tpl] ) -- returns only those elements that are not
   undefined values */

dojox.jtlc._declareTag( 'defined', {

	constructor: function( tpl ) {
		this.arg = tpl || dojox.jtlc.tags.current();
	},

	compile: function( self ) {
		if( !this.loop || this.loop.started )
			throw Error( "defined() is never a singleton, wrap it in many() or []" );
		this.compile( self.arg );
		var	value = this.popExpression(),
			t = this.addLocal();
		if( t != value )	this.code.push( t + '=' + value + ';' );
		this.code.push( 'if(typeof ' + t + '==="undefined"' + ')continue;' );
		this.expressions.push( t );
	}
} );

/* query( query [,arg [,extra] ] ) -- queries arg or the input if arg is not
   present. Inside a loop it acts as a generator, outside of the 
   loop context it returns a single value. Any extra arguments are evaluated
   and passed to the query function */

dojox.jtlc._declareTag( 'query', dojo.declare( dojox.jtlc._MultiArgTag, {

	constructor: function( query ) {
		if( arguments.length < 1 )
			throw Error( "query() requires at least 1 argument" );
		this.query = query;
	},

	callQuery: function( self ) {
		return this.addGlobal( this.queryLanguage( self.query ) ) + '(' + 
			self.argumentList.call( this, self ) + 
		')';
	},

	compile: function( self ) {

		self.compileArgs.call( this, self );

		if( this.loop ) {

			this.generator( self.callQuery.call( this, self ) );

		} else {

			this._singletonQuery = this._singletonQuery || this.addGlobal( new Function(
				"r",
				( this.singletonQuery.failOnManyResults ? 
					"if(r.length>1) throw Error('Singleton query \"'" + self.query + "'\" returned ' + r.length + ' results');"
					: "" ) +
				( this.singletonQuery.failOnNoResults ?
					"if(!r.length) throw Error('Singleton query \"'" +  self.query + "'\" returned no results');return r[0];"
					: "return r.length ? r[0] : null" )
			) );
			
			this.expressions.push( 
				this._singletonQuery + '(' + self.callQuery.call( this, self ) + ')'
			);
		}
	}
} ) );

/* group( key, body [, query] ) -- evaluates body template over
   results from query (defaults to current input or arg(0)) grouped
   by key. The key could be a singleton template (e.g. expr()) or an
   array of such. Within the body, current input is set to the slice
   of query results with the same key. Note that query results should
   be already sorted by key!
*/

dojo.declare( 'dojox.jtlc._GroupLoop', dojox.jtlc._Loop, {

	"-chains-": {
		begin: "after",
		end:   "before"
	},

	constructor: function( _, key, first_in_group ) {
		this.key = typeof key === 'object' && key.constructor === Array ? key : [key];
		this.nextItem = false;
		this.first_in_group = first_in_group;
	},

	item: function() {
		if( !this._items )	throw Error( "Internal error: loop not initialized" );
		return this.lockedItem || this._items + '[' + this._i + ( this.nextItem ? '+1' : '' ) + ']';
	},

	count: function() {
		return '(' + ( 
			this.lockedItem ?
				this.first_in_group :
				this._i + ( this.nextItem ? '+1' : '' )
		) + ')';
	},

	begin: function() {

		this.compiler.code.push( "if(" + this._i + "<" + this._items + ".length-1){" );

		for( var i=this.key.length-1; i>=0; --i ) {
			this.compiler.compile(this.key[i]);
			this.nextItem = true;				
			this.compiler.compile(this.key[i]);
			this.nextItem = false;
		}

		this.compiler.code.push( "if(" );

		for( var i=0; i<this.key.length; ++i ) {
			if( i )	this.compiler.code.push( "&&" );
			this.compiler.code.push( this.compiler.popExpression() + '==' + this.compiler.popExpression() );
		}

		this.compiler.code.push( ") continue;}" );
	},

	end: function() {
		this.compiler.code.push( this.first_in_group + '=' + this._i + '+1;' );
	},

	lockItem: function( item ) {
		if( item != this.item() ) {
			var	save_i = this.addLocal();
			this.compiler.code.push( save_i + "=" + this._i + ";" );
			this.compiler.code.push( "for(" + this._i + "=" + this.first_in_group + ";" + this._i + "<=" + save_i + ";++" + this._i + ")" );
			this.compiler.code.push( this.item() + "=" + item + ";" );
			this.compiler.code.push( this._i + "=" + save_i + ";" );
			this.locals.pop();
		}
		this.inherited( arguments, [this._items + ".slice(" + this.first_in_group + "," + this._i + "+1)"] );
	}
} );

dojox.jtlc._declareTag( 'group', {

	constructor: function( key, body, query ) {
		this.key = key;
		this.body = body;
		if( query )	this.query = query;
	},

	compile: function( self ) {

		if( !( '_groupOptimizer' in this.optimizers ) )
			this.optimizers._groupOptimizer = self.optimize;

		if( !this.loop )
			throw Error( "group() is never a singleton, wrap it in many() or []" );

//		if( this.loop.started() )
//			throw Error( "group() used in a wrong context" );

		var first_in_group = this.addLocal();
		this.code.push( first_in_group + '=0;' );

		/* Replace with _GroupLoop; caller will clean up */
		this.loop = new dojox.jtlc._GroupLoop( this, self.key, first_in_group ); 

		if( self.query )	this.compile( self.query );
		else				this.generator();

		this.loop.lockItem( this.popExpression() );
		this.compile( self.body );
	},

	optimize: function( body ) {
		return body.replace(
			/\(([a-z][a-z0-9]*)\.slice\(([a-z][a-z0-9]*),([a-z][a-z0-9]*)\+1\)\)(\.length|\[0\])/ig,
			function( _0, a, from, to, op ) {
				return op == '.length' ? '(' + to + '-' + from + '+1)' : a + '[' + from + ']';
			}
		);
	}
} );


