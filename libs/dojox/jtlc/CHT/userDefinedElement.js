// Copyright (C) 2010-2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( 'dojox.jtlc.CHT.userDefinedElement' );

dojo.declare( 'dojox.jtlc.CHT.userDefinedElement', null, {
	constructor: function( elt, url ) {
		this.kwarg = elt.kwarg || {};

		if( this.kwarg.compiled && elt.sections )	
			throw Error( "Compiled template " + elt.arg + " should not have sections" );

		if( elt.sections )	this.sections = elt.sections;

		this.name = elt.arg;
		this.sourceUrl = url;
	},

	_tag: dojo.extend(
		function( cht, elt, def ) {
			this.def = def;
			if( elt.arg )	this.arg = elt.arg.parse( cht );
			if( elt.sections ) {
				this.sections = {};
				dojo.forEach( elt.sections, function(s) {
					this.sections[s.openTag] = s.body;
				}, this );
				if( elt.body )	this.sections[""] = elt.body;
			}
		}, {

			_notAnExpression: { 
				toString: function(){ 
					throw Error( "BUG: access to current_input bypasses generator()" ); 
				} 
			},

			_argByName: function( compiler, generator, cur_input, expr ) {

				if( compiler.current_input === this._notAnExpression && !expr && !compiler.loop.lockedItem ) {
					if( cur_input )	compiler.current_input = cur_input;
					else 			delete compiler.current_input;
					compiler.compile( this.arg );
					compiler.current_input = this._notAnExpression;
				} else
					generator.call( compiler, expr );
			},

			compile: function( self ) {
				var old_current_input, old_generator;
				
				if( self.def.kwarg.macro && self.arg ) {
					old_current_input = this.hasOwnProperty( 'current_input' ) ? this.current_input : null;
					var	gen = this.generator;
					old_generator = this.hasOwnProperty( 'generator' ) ? gen : null;
					this.generator = function( expr ) { 
						self._argByName( this, gen, old_current_input, expr );
					}
					this.current_input = self._notAnExpression;
				}

				if( self.sections )	
					this._chtSections[ self.def.name ] = self.sections;
				
				if( !self.def.kwarg.macro && ( self.arg || this.current_input === self._notAnExpression ) ) {
					var	new_input, local;
					if( self.arg ) {
						this.compile( self.arg );
						new_input = this.popExpression();
						local = this.addLocal();
						if( new_input.length > 4 ) {
							this.code.push( local + '=' + new_input + ';' );
							new_input = '(' + local + ')';
						} else if( new_input === local ) {
							new_input = '(' + new_input + ')';
						} else {
							this.locals.pop();
							local = null;
						}
					} else
						new_input = this.generator();

					this.nonAccumulated( function() {
						this.compileSequence( self.def.body );
					}, new_input );

					if( local )	this.locals.pop();

				} else	this.compileSequence( self.def.body );

				if( self.sections )
					delete this._chtSections[ self.def.name ];

				if( self.def.kwarg.macro && self.arg ) {		
					if( old_generator )	this.generator = old_generator;
					else 				delete this.generator;
					if( old_current_input )	this.current_input = old_current_input;
					else 					delete this.current_input;
				}
			}
		}
	),

	_compiledTag: dojo.extend(
		function( cht, elt, tag ) {
			this.name = elt.openTag;
			this.tag = tag;
			if( elt.arg )	this.arg = elt.arg.parse( cht );
			this.bind = cht.tags.bind;
		}, {
			// Hook for <? module ?>
			_compileOptions: function() { 
				return {
					_templateName: this.name, 
					_transition: this.tag.def.kwarg.transition
				}
			},

			compile: function( self ) {

				if( !('compiledTemplates' in this) )	this.compiledTemplates = {};
				if( !(self.name in this.compiledTemplates) ) {
					// Create a forwarding thunk to resolve issues with template recursion
					var forward_to = null;
					this.compiledTemplates[self.name] = function(){ return forward_to.apply( this, arguments ); }
					this.compiledTemplates[self.name].async = self.tag.def.kwarg.async || false;

					this.compiledTemplates[self.name] = forward_to =
						dojox.jtlc.compile( self.tag, this.compileArguments.language, 
									dojo.mixin( 
										{ compiledTemplates: this.compiledTemplates }, 
										this.compileArguments.options,
										self._compileOptions( this )
									)
						);
				}
				
				self._compile.call( this,
					this.addGlobal( this.compiledTemplates[self.name] ),
					self.arg,
					this.compiledTemplates[self.name].async
				);
			},

			// This function is also used by the <?embed?> tag
			_compile: function( fn, arg, is_deferred ) {
				var	v, w;

				if( is_deferred )	w = this._beginWait();

				if( arg )	this.compile( arg );
				else		this.generator();

				v = this.popExpression();

				if( v == '$[0]' ) {
					this.expressions.push( fn + '.apply(' + this.scopes[0] + ',$)' );
				} else {
					this.expressions.push( fn + '.apply(' + this.scopes[0] + ',' + this.addGlobal( dojox.jtlc._copyArgumentsReplaceFirst ) + '($,' + v + '))' );
				}

				if( is_deferred )	this._endWait( w, true );
			}
		}
	),

	tag: function( cht, elt ) {

		var	t = this.kwarg.compiled && elt.openTag
				? new cht._appendToOutput( [ new this._compiledTag( cht, elt, new this._tag( cht, {}, this ) ) ] )
				: new this._tag( cht, elt, this ),
			slots = cht._attributeSlots( elt );

		if( slots ) return dojox.jtlc.tags.scope( t, slots );
		else		return t;
	},

	compile: function( self ) {
		this._templateName = self.name;
		if( self.kwarg.transition )	this._transition = self.kwarg.transition;
		this.compile( self.tag( this, {} ) );
	}
} );	 

