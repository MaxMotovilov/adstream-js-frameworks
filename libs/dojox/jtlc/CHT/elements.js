// Copyright (C) 2010-2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.CHT.elements" );

dojo.require( "dojox.jtlc.CHT.tags" );

dojox.jtlc.CHT.elements = (function() {
	var	d = dojo, dj = dojox.jtlc;

	var _deckShuffle = d.extend(
		function( cards ) {
			this.cards = cards;
			this.seq = [{ front: { pos: cards.length } }];
		}, {

			cut: function( fwd, back ) {
				this.seq[ this.seq.length-1 ].back = this._cut( back );
				this.seq.push({ front: this._cut( fwd ) });
			},
			
			_cut: function( value ) {
				var v = { pos: this.cards.length };
				if( typeof value !== "undefined" && value !== null && value !== "" && value !== false )
					v.key = value;
				return v;
			},

			shuffle: function() {
				this.seq[ this.seq.length-1 ].back = { pos: this.cards.length };

				var	from = this.seq[0].front.pos,
					to = this.seq[this.seq.length-1].back.pos,
					splice_args = [ from, to-from ];

				d.forEach( this.seq, function( seq ) {
					if( 'key' in seq.front )
						seq.key = seq.front.key;
					else if( 'key' in seq.back )
						seq.key = seq.back.key;
				}, this );

				d.forEach(
					d.filter( 
						this.seq, function( seq ){ return 'key' in seq; }
					).sort( function( s1, s2 ) {
						if( typeof s1.key === 'number' && typeof s2.key === 'number' )
							return s1.key - s2.key;
						else
							return s1.key.toString().localeCompare( s2.key.toString() );
					} ),
					function( s ) {
						var slc = this.cards.slice( s.front.pos, s.back.pos );
						slc.unshift( splice_args.length, 0 );
						splice_args.splice.apply( splice_args, slc );
					},
					this
				);
				
				this.cards.splice.apply( this.cards, splice_args );
			}
		}
	);

	return {	
		"embed": {
			_tag: d.extend(
				function( cht, elt ) {
					if( !elt.kwarg.template )
						throw Error( "<?embed?> must have the attribute \"template=\"" );

					this.runtimeError = new Error( '"' + elt.kwarg.template + '" did not resolve to a template' );

					// Note that this.template could be replaced by the <?load?> implementation!
					this.template = elt.kwarg.template.parse( cht );
				
					if( elt.arg )
						this.arg = elt.arg.parse( cht );
					this.async = elt.kwarg.async !== 'false';
				
					// Stealing a method to avoid the complexity of inheritance
					this._compile = cht._userDefinedElement.prototype._compiledTag.prototype._compile;
				},{
					compile: function( self ) {
						this.compile( self.template );
					
						// Relying on _compile() to only use its first argument once
						self._compile.call( this, this.popExpression(), self.arg, self.async );
					
						var cons = this.addGlobal( dj._CHTTemplateInstance ),
							err  = this.addGlobal( self.runtimeError );
					
						this.code.push(
							'if(!(' + this._chtHTML + '[' +
								this._chtHTML + '.push(' + this.popExpression() +
							')-1]) instanceof ' + cons + ') throw ' + err + ';'
						);
					}
				}
			),
		
			tag: function( cht, elt ) {
				var slots = cht._attributeSlots( elt, "template", "async" ),
					t = new this._tag( cht, elt );
				return slots ? dj.tags.scope( t, slots ) : t;
			}
		},

		"scope": {
			sections: {	"" : {allowArgument:true} },

			tag: function( cht, elt ) {
				var body = new cht.tags.genericBody( elt.body, elt.arg && elt.arg.parse( cht ) ),
					slots = {};

				for( var s in elt.kwarg )
					slots[s] = elt.kwarg[s].parse( cht );

				return dj.tags.scope( body, slots );
			}
		},

		"if": {
			sections: {	"" : {allowArgument:true}, "elseif" : {allowArgument:true,allowMultiple:true}, "else": {} },

			_tag: d.extend( 
				function( cht, elt ) {
					this.ifTrue = [ {
						condition: elt.arg ? elt.arg.parse( cht ) : dj.tags.current(),
						body: elt.body
					} ];

					d.forEach( elt.sections, function(s) {
						if( s.openTag == 'elseif' )
							this.ifTrue.push( {
								condition: s.arg ? s.arg.parse( cht ) : dj.tags.current(),
								body: s.body
							} );
						else
							this.ifFalse = s.body;
					}, this );
				},{
					compile: function( self ) {
				
						d.forEach( self.ifTrue, function( s, i ) {
							this.compile( s.condition );
							this.code.push( ( i == 0 ? 'if(' : '}else if(' ) + this.popExpression() + '){' );
							this.compileSequence( s.body );
						}, this );

						if( self.ifFalse ) {
							this.code.push( '}else{' );
							this.compileSequence( self.ifFalse );
						}

						this.code.push( '}' );
					}
				} 
			),

			tag: function( cht, elt ) {	return new this._tag( cht, elt ); }
		},

		"foreach": {
			sections: { "" : {allowArgument:true}	},
			tag: function( cht, elt ) {
				return dj.tags.one( dj.tags.many(	// Ensure fresh loop context
					cht.tags.foreachBody( elt.body, elt.arg && elt.arg.parse( cht ) )
				) );
			}
		},

		"group": {
			sections: { "" : {allowArgument:true} },

			tag: function( cht, elt ) {
				if( !!elt.kwarg.key == !!elt.kwarg.count )
					throw Error( '<?group?> should have one of attributes: key=, count=' );
				return dj.tags.one( dj.tags.many(	// Ensure fresh loop context
					dj.tags.group( 
						elt.kwarg.key ?
							elt.kwarg.key.parse( cht, true ) :
							dj.tags.expr( 'Math.floor($#/(' + elt.kwarg.count + '))' ),
						cht.tags.genericBody( elt.body ),
						elt.arg ? elt.arg.parse( cht ) : dj.tags.current()
					)
				) );
			}
		},

		"shuffle": {
			sections: { "" : {allowArgument:true} },
			
			_tag: d.declare( dj.CHT.tags._genericBody, {

				inheritedCompile: dj.CHT.tags._genericBody.prototype.compile,

				compile: function( self ) {

					var	old_cuts = this._chtShuffle, cp = this.code.length;
					this._chtShuffle = { lvar: this.addLocal() };
					this.code.push( this._chtShuffle.lvar + '=new ' + this.addGlobal( _deckShuffle ) + '(' + this._chtHTML + ');' );

					self.inheritedCompile.call( this, self );

					if( !this._chtShuffle.cuts )
						this.code.splice( cp, 1 );
					else
						this.code.push( this._chtShuffle.lvar + '.shuffle();' );

					this.locals.pop();
					if( !old_cuts )	delete this._chtShuffle;
					else			this._chtShuffle = old_cuts;
				}
			} ),

			tag: function( cht, elt ) { 
				return new this._tag( elt.body, elt.arg && elt.arg.parse( cht ) );
			}
		},

		"cut": {
			_tag: d.extend(
				function( fwd, back ) {
					if( fwd )	this.forward = fwd;
					if( back )	this.back = back;
				}, {
					compileAndCheck: function( cpl, arg ) {
						var cp = cpl.code.length;
						cpl.compile( arg );
						return cpl.code.length > cp;
					},

					compile: function( self ) {

						var	v, cp, fwd, back;

						if( !this._chtShuffle )
							throw Error( "<?cut?> cannot be used outside of shuffle or from a different compiled template" );

						this._chtShuffle.cuts = true;

						if( self.forward ) {
							if( self.compileAndCheck( this, self.forward ) && self.back ) {
								fwd = this.popExpression();
								v = this.addLocal();
								if( v != fwd ) {
									cp = this.code.length;
									this.code.push( v + '=' + fwd + ';' );
								}
							} else
								fwd = this.popExpression();
						}

						if( self.back ) {
							if( !self.compileAndCheck( this, self.back ) && cp )
								this.code.splice( cp, 1 );
							back = this.popExpression();
						}

						this.code.push( this._chtShuffle.lvar + ".cut(" + ( v || fwd || "null" ) + "," + ( back || "null" ) + ");" );

						if( v )	this.locals.pop();
					}
				}
			),

			tag: function( cht, elt ) { 
				if( elt.arg )	
					throw Error( "<?cut?> should not have a positional argument" );
				return new this._tag( 
					elt.kwarg.forward && elt.kwarg.forward.parse( cht ),
					elt.kwarg.back && elt.kwarg.back.parse( cht )
				);
			}
		},

		"when": {
			sections: { "" : {allowArgument:true}, "else": {}, "except": {} },

			_tag: d.extend( 
				function( cht, elt ) {
					this.arg = elt.arg 
						? elt.arg.parse // Hook for the CHT loader
							? elt.arg.parse( cht ) 
							: elt.arg
						: dj.tags.current();
					this.ifReady = elt.body;
					d.forEach( elt.sections, function(s) {
						if( s.openTag == 'else' )
							this.ifNotReady = s.body;
						else
							this.ifFailed = s.body;
					}, this );
				}, {
					compile: function( self ) {

						var old_when_ctx;
						if( old_when_ctx = this._whenCtx )	
							delete this._whenCtx;

						if( self.ifNotReady || self.ifFailed ) {
							this._whenCtx = { flagVar: this.addLocal(), hasExcept: self.ifFailed && true };
							this.code.push( this._whenCtx.flagVar + '=true;' );
						}

						this.code.push( 'do{' );

						this._openWait = this._beginWait( this._whenCtx && this._whenCtx && this._whenCtx.flagVar );

						if( self.arg )			this.compile( self.arg );
						else					this.generator();

						if( this._openWait ) {
							this._endWait( this._openWait );
							delete this._openWait;
						}

						var	result = this.popExpression(),
							lock = this.addLocal();

						if( lock != result )
							this.code.push( lock + '=' + result + ';' );

						this.nonAccumulated( function() {
							this.compileSequence( self.ifReady );
						}, '(' + lock + ')' );

						this.locals.pop();
					
						this.code.push( '}while(' + ( this._whenCtx ? this._whenCtx.flagVar + '=' : '' ) + 'false);' );
					
						if( self.ifFailed ) {
							this.code.push( 'if(' + this._whenCtx.flagVar + ' instanceof Error){' );
							this.nonAccumulated( function() {
								this.compileSequence( self.ifFailed );
							}, '(' + this._whenCtx.flagVar + ')' );
							this.code.push( '}' );
						}

						if( self.ifNotReady ) {
							this.code.push( (self.ifFailed ? 'else ' : '') + 'if(' + this._whenCtx.flagVar + '){' );
							this.compileSequence( self.ifNotReady );
							this.code.push( '}' );
						}

						if( old_when_ctx )			this._whenCtx = old_when_ctx;
						else if( this._whenCtx )	delete this._whenCtx;
					}
				}
			),
		
			tag: function( cht, elt ) {	return new this._tag( cht, elt ); }
		}
	}
})();

