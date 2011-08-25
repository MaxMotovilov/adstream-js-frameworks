// Copyright (C) 2010-2011 Adstream Holdings
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
				return (d.global.preloadedCHT || {})[this.url()] ||
						d.xhrGet({ url: decorateUrl( this.url() ) });
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

	var cache = {},	cht_instance = null;

	function chtInstance() {
		if( !cht_instance )	cht_instance = new dj.CHT( { loadTemplates: loadTemplates } );
		return cht_instance;
	}

	function loadAndParseModule( mdl_or_sn ) {
		var mdl = mdl_or_sn instanceof SplitName ? mdl_or_sn.namespace() : mdl_or_sn;
		if( cache[mdl] )	return cache[mdl];

		var	sn  = mdl_or_sn instanceof SplitName ? mdl_or_sn : splitModuleName( mdl_or_sn );
			src = sn.sourceText(),
			nls = sn.nlsBundle();

		return d.when( src,	function( src ) {
			cache[mdl] = { parsed: {}, compiled: {}, nls: nls };
			return d.when( 
				chtInstance().parse( src, cache[mdl].parsed, sn.url() ),
				function() { return cache[mdl]; }
			)
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

		cache[root] = { parsed: {}, compiled: {}, nls: nls };

		return d.when( wait, function() {
			return d.when( 
				chtInstance().parse( src, cache[root].parsed ),
				function(){ return cache[root]; }
			);
		} );
	}

	function resolveTemplatesLater( refs, mdl, tpls ) {
		return function( cached ) {
			d.forEach( tpls, function( tpl ) {
				if( !(tpl in cached.parsed) )
					throw Error( '<?' + tpl + '?> is not defined in ' + mdl );
				refs[mdl + '.' + tpl] = cached.parsed[tpl];
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

	return {
		initCompiler: function( opts ) {
			cht_instance = new dj.CHT( d.mixin( {}, opts, { loadTemplates: loadTemplates } ) );
		},

		require: function( /* tpl_module_with_overrides... */ ) {
			var result = new WaitingList();

			for( var i=0; i<arguments.length; ++i ) {
				var	mdl_list = arguments[i].split( /\s*\+\s*/ );
				result.push(
					cache[ mdl_list[0] ] || loadAndParseModuleList( mdl_list ) 
				);
			}

			return result;
		},

		get: function( tpl ) {
			var sn = splitTemplateName( tpl ),
				cached = cache[ sn.namespace() ] || loadAndParseModule( sn );
			return cached.then ? deferGetTemplate( cached, sn ) : getTemplate( sn );
		},

		getLocalization: function( mdl ) {
			var	cached = cache[ splitModuleName( mdl ).namespace() ];
			return cached && cached.nls;
		}
	};
})();
