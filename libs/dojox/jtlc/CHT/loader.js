// Copyright (C) 2010-2012 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

/*
   CHT loader with support for template libraries and localization bundles
*/

dojo.provide( 'dojox.jtlc.CHT.loader' );
dojo.require( 'dojox.jtlc.CHT' );
dojo.require( 'dojo.i18n' );
dojo.require( 'dojo.DeferredList' );

dojox.jtlc.CHT.loader = (function() {

	var	d = dojo, dj = dojox.jtlc;

	function decorateUrl( url ) {
		return d.config.cacheBust ?
			url + (url.indexOf("?") == -1 ? "?" : "&") + String(d.config.cacheBust).replace(/\W+/g,"") :
			url;
	}
	var SplitName = d.extend( 
		function( mdl, file, tpl ) {
			this.moduleName = mdl;
			this.fileName = file;
			if( tpl ) this.templateName = tpl;
		}, {
			_extModuleName: function( ext ) {
				return this.moduleName ? this.moduleName + "." + ext : ext;
			},

			url: function() {
				return d.moduleUrl( this._extModuleName( "CHT" ), this.fileName + ".cht" ).toString();
			},

			namespace: function() {
				return this._extModuleName( this.fileName );
			},

			nlsBundle: function() {
				try {
					d.requireLocalization( this._extModuleName( "CHT" ), this.fileName );
					return d.i18n.getLocalization( this._extModuleName( "CHT" ), this.fileName );
				} catch( e ) { return {}; }
			},

			sourceText: function() {
				var pre = d.global.preloadedCHT || (d.global.preloadedCHT = {});
				return pre[this.url()] ||
					   ( pre[this.url()] = d.xhrGet({ url: decorateUrl( this.url() ) }) );
			}
		}
	);

	function apply( this_object, method, args )	{
		return this_object[method].apply( this_object, args );
	}

	var WaitingList = d.extend(
		function() { this.list = []; },
		{
			push: function( v ) {
				if( v.then )	this.list.push( v );
				return v;
			},

			then: function() {
				if( this.list.length == 0 )	return arguments[0]([]);
				if( this.list.length == 1 )	return apply( this.list[0], 'then', arguments );
				return apply( new d.DeferredList( this.list ), 'then', arguments );
			}
		}
	);

	function splitModuleName( mdl_name ) {
		var spl = mdl_name.split( '.' );
		return new SplitName( spl.length > 1 ? spl.slice( 0, spl.length-1 ).join( '.' ) : "", spl[spl.length-1] );
	}

	function splitTemplateName( tpl_name ) {
		var spl = tpl_name.split( '.' );
		if( spl.length < 2 )	throw Error( 'Template module name is missing in reference to ' + tpl_name );
		return new SplitName( 
			spl.length > 2 ? spl.slice( 0, spl.length-2 ).join( '.' ) : "", 
			spl[spl.length-2], spl[spl.length-1]
		);
	}

	function deferredFunction( fn, deferred ) {
		fn.then = function( /* callbacks */ ) {
			return deferred.then.apply( deferred, arguments );
		}
		return fn;
	}

	function mergeNlsBundles( to, from ) {
		for( var i in from )
			if( from[i] )	to[i] = from[i];
	}

	var Context = d.extend( 
		function( cached ) { this.cached = cached; }, 
		{
			enter: function( state ) {
				state.compileArguments.options = d.delegate( 
					state.compileArguments.options, 
					{ i18nDictionary: this.cached.nls, oldOptions: state.compileArguments.options }
				);
				state.i18nDictionary = this.cached.nls;
			},

			exit: function( state ) {
				state.compileArguments.options = state.compileArguments.options.oldOptions;
				state.i18nDictionary = state.compileArguments.options.i18nDictionary;
			}			
		}
	);

	var cache = {},	cht_instance = null;

	function chtInstance() {
		if( !cht_instance )	
			loader.initCompiler();
		return cht_instance;
	}

	function parseAndResolveModule( mdl, src, nls, url ) {
		if( cache[mdl] )
			return cache[mdl].deferred || cache[mdl];

		var	ns = {};

		cache[mdl] = { parsed: ns, compiled: {}, nls: nls };
		cache[mdl].context = new Context( cache[mdl] );
		
		return cache[mdl].deferred = d.when( 
			chtInstance().parse( src, ns, url ),
			function() { 
				delete cache[mdl].deferred;
				return cache[mdl]; 
			}
		);
	}

	function loadAndParseModule( mdl_or_sn ) {
		var mdl = mdl_or_sn instanceof SplitName ? mdl_or_sn.namespace() : mdl_or_sn;
		if( cache[mdl] )	return cache[mdl].deferred || cache[mdl];

		var	sn  = mdl_or_sn instanceof SplitName ? mdl_or_sn : splitModuleName( mdl_or_sn ),
			src = sn.sourceText(),
			nls = sn.nlsBundle();

		return d.when( src,	function( src ) {
			return parseAndResolveModule( mdl, src, nls, sn.url() );
		} );
	}

	function loadAndParseModuleList( mdl_list ) {

		var root = mdl_list[0],
			all = d.map( mdl_list.reverse(), splitModuleName ),
			nls,
			src = [],
			wait = new WaitingList();

		d.forEach( all, function( sn, i ) {
			d.when( wait.push( sn.sourceText() ), function( text ) {
				src[i] = { url: sn.url(), src: text };
			} );
		} );

		d.forEach( all, function( sn ) {
			if( nls )	mergeNlsBundles( nls, sn.nlsBundle() );
			else		nls = sn.nlsBundle();
		} );

		return d.when( wait, function() {
			return parseAndResolveModule( root, src, nls );
		} );
	}

	function resolveTemplatesLater( refs, mdl, tpls ) {
		return function( cached ) {
			d.forEach( tpls, function( tpl ) {
				if( !(tpl in cached.parsed) )
					throw Error( '<?' + tpl + '?> is not defined in ' + mdl );
				refs[mdl + '.' + tpl] = d.delegate( 
					cached.parsed[tpl],
					{ context: cached.context }
				);
			} );
			return false; // Prevent propagation of a deferred
		}
	}

	function loadTemplates( refs ) {

		var namespaces = {}, deferred = new WaitingList();

		for( var tpl in refs ) {
			var sn = splitTemplateName( tpl );
			if( !(sn.namespace() in namespaces) )
				namespaces[sn.namespace()] = [];
			namespaces[sn.namespace()].push( sn.templateName );
		}
		
		for( var ns in namespaces )
			deferred.push( d.when(
				cache[ns] || loadAndParseModule( ns ),
				resolveTemplatesLater( refs, ns, namespaces[ns] )
			) );

		return d.when( deferred, function() { return refs; } );
	}

	function getTemplate( sn ) {
		var cached = cache[sn.namespace()];

		if( !(sn.templateName in cached.compiled) ) {
			if( !(sn.templateName in cached.parsed) )
				throw Error( '<?' + sn.templateName + '?> is not defined in ' + sn.namespace() );
			cached.compiled[sn.templateName] = 
				dj.compile(
					cached.parsed[sn.templateName],
					chtInstance(),
					{ i18nDictionary: cached.nls, compiledTemplates: cached.compiled }
				);
		}

		return cached.compiled[sn.templateName];					
	}

	function deferGetTemplate( cached, sn ) {

		var deferredTemplateInstance = d.extend( 
			function( args ) {
				this.args = dj._copyArguments( args );
			}, {
				render: function( /* render args */ ) {
					var render_args = dj._copyArguments( arguments ),
						evaluator_args = this.args;
					return d.when( cached, function() {
						var inst = getTemplate( sn ).apply( null, evaluator_args );
						return inst.render.apply( inst, render_args );
					} );
				}
			}
		);

		return deferredFunction( function( /* evaluator args */ ) {
			d.when( cached, function( cached_value ) { cached = cached_value; } );
			return cached.then ? new deferredTemplateInstance( arguments ) :
								 getTemplate( sn ).apply( null, arguments );
		}, cached );
	}
	
	// <? load template= [async=] ?>
	var loadExtension = {		
		tag: function( cht, elt ) {
			if( !elt.kwarg.template )
				throw Error( "<?load?> must have the attribute \"template=\"" );
			
			var	embed = cht.elements.embed.tag(	cht, elt );
			
			if( !embed.async ) {
			
				embed.template = dj.tags.bind( loader.getSync, embed.template );
				return embed;
				
			} else {
			
				if( elt.body )
					elt.sections = [ {
						openTag: "else",
						kwarg: {},
						body: elt.body
					} ];
					
				elt.arg = cht.tags.expr(
					"[$0,$]", 
					cht.tags.wait(
						dj.tags.bind( loader.get, embed.template )
					)
				);

				embed.template = cht.tags.expr( "$[1]" );
				embed.arg = cht.tags.expr( "$[0]" );
			
				elt.body = [ embed ];
				
				return cht.elements.when.tag( cht, elt );
			}
		},
		
		sections: function( elt ) {
			return elt.kwarg.async !== 'false' && {	"" : {allowArgument:true} };
		}
	};
	
	var loader;

	return loader || (loader = {
		initCompiler: function( opts ) {
		
			opts = opts ? d.mixin( {}, opts, { loadTemplates: loadTemplates } ) : { loadTemplates: loadTemplates };
		
			opts.elements = opts.elements
				? d.mixin( { load: loadExtension }, opts.elements )
				: { load: loadExtension };
			
			cht_instance = new dj.CHT( opts );
		},

		require: function( /* tpl_module_with_overrides... */ ) {
			var result = new WaitingList();

			for( var i=0; i<arguments.length; ++i ) {
				var	mdl_list = arguments[i].split( /\s*\+\s*/ );
				result.push(
					cache[ mdl_list[0] ] && cache[ mdl_list[0] ].deferred || 
					cache[ mdl_list[0] ] ||
					loadAndParseModuleList( mdl_list ) 
				);
			}

			return result;
		},

		get: function( tpl ) {
			var sn = splitTemplateName( tpl ),
				cached = 
					cache[ sn.namespace() ] && cache[ sn.namespace() ].deferred || 
					cache[ sn.namespace() ] || 
					loadAndParseModule( sn );
			return cached.then ? deferGetTemplate( cached, sn ) : getTemplate( sn );
		},
		
		getSync: function( tpl ) {
			var sn = splitTemplateName( tpl ),
				cached = 
					cache[ sn.namespace() ] && cache[ sn.namespace() ].deferred || 
					cache[ sn.namespace() ];
					
			if( !cached || cached.then )
				throw Error( "CHT template \"" + tpl + "\" has not been loaded" );
					
			return getTemplate( sn );
		},
		
		getLocalization: function( mdl ) {
			var	cached = cache[ splitModuleName( mdl ).namespace() ];
			return cached && cached.nls;
		}
	});
})();
