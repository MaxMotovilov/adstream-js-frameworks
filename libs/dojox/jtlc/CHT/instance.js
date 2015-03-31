// Copyright (C) 2014-2015 12 Quarters Consulting
// Copyright (C) 2010-2014 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

dojo.provide( "dojox.jtlc.CHT.instance" );

dojo.require( "dojo.parser" );
dojo.require( "dojo.DeferredList" );
dojo.require( "dijit._Widget" );

(function() {

	var	d = dojo, dj = dojox.jtlc;

	function _isDefaultThis( _this ) {
		return this === _this;
	}

	function _cleanupWidgets( ref_node, ref_w ) {

		// It would be better to check for dojoType, but unfortunately dijit.byNode() does
		// not handle stray nodes gracefully.

		var nodes = 
			ref_node.query ?
				ref_node.filter( isElement ).query( '[widgetid]' ) :
			ref_node.nodeType == 1 ?
				d.query( '[widgetId]', ref_node ) :
			null;

		if( nodes ) nodes.concat( 
				ref_node.filter ? 	
					ref_node.filter( function(node){ return dojo.attr( node, 'widgetid' ); } ) :
				dojo.attr( ref_node, 'widgetid' ) ?
					[ ref_node ] : []
			).forEach( 
				function( node ) {
					var w = dijit.byNode( node );
					if( w && ref_w !== w && w._started && !w._destroyed /* _Widget.destroy() is not protected from repeat calls */ )
						w.destroy( true ); // The DOM will be destroyed after transition has completed
				} 
			);

		// Workaround to prevent post-destruction hooks from triggering and causing an exception.
		// FIXME: Very expensive; ought to be removed when the underlying issue in dijit is fixed.

		nodes = ( ref_node.query ? ref_node.filter( isElement ).query( '*' ) 
				: ref_node.nodeType == 1 ? d.query( '*', ref_node ) : null );
		
		if( nodes )	{
			if( ref_node.query )
				nodes.push.apply( nodes, ref_node );
			else
				nodes.push( ref_node );

			nodes.forEach( function(n){ if( '_cssState' in n ) delete n._cssState; } );
		}

		function isElement(node){ 
			return node.nodeType==1; 
		}
	}

	// FIXME: kludge, based on Dojo-specific behavior of promises.
	function _syncResolve( p_or_v ) {
		if( p_or_v.then && p_or_v.isResolved ) {
			if( p_or_v.isResolved() )
				p_or_v.then( function( v ) { p_or_v = v; } );
			else if(p_or_v.isRejected() ) {
				p_or_v.then( null, function( err ) { p_or_v = err; } );
				throw p_or_v;
			}
		}

		return p_or_v;
	}

	// The following code has been lifted from dojo.parser as there's no convenience API for it. Note that
	// it has changed since Dojo 1.8

	var _startupWidgets = dojo.version.major * 1000 + dojo.version.minor >= 1008
		? function _startupWidgets( instances ) {
			dojo.forEach( instances, function(instance){
				if(	instance && instance.startup &&	!instance._started )
					instance.startup();
			})
		}
		: function _startupWidgets( instances ) {
			dojo.forEach( instances, function(instance){
				if(	instance && instance.startup &&	!instance._started && 
					(!instance.getParent || !instance.getParent() || instance.getParent()._started)
				){
					instance.startup();
				}
			})
		}

	function _getNodes( first, last ) {
		var v = new d.NodeList();
		while( first && first !== last ) {
			v.push( first );
			first = first.nextSibling;
		}
		return v;
	}

	function _context( first, last, parent ) {
		if( !parent && first.parentNode !== last.parentNode )
			throw Error( "Context nodes do not have the same parent" );
		this.first = first;
		this.last = last;
		this.parent = parent || first.parentNode;
	}

	var _innerContext = d.extend(
		_context, {
			isEmpty: function() {
				return !this.first || !this.last;
			},

			outer: function() {
				if( !this.first || !this.last )
					throw Error( "Cannot expand an empty context" );
				return new _outerContext( 
					this.first.previousSibling, this.last.nextSibling, this.parent 
				);
			},

			nodes: function() { 
				return this.first ? _getNodes( this.first, this.last.nextSibling ) : new d.NodeList();
			}
		}
	);

	var pos_map = { // 1: up, 2: previous, 4: replace
		before: 3,
		after:	1,
		replace:5,
		only: 	4,
		first: 	2,
		last: 	0
	};

	var _outerContext = d.extend( 
		function( ref_node, pos ) {

			//	Direct (copy) construction

			if( typeof pos === "object" ) {
				_context.apply( this, arguments );
				return;
			}

			if( typeof pos === "number" ) {
				var cn = ref_node.childNodes;
				if( !cn.length || cn.length <= pos )	
					pos = 'last';
				else {	
					ref_node = cn[ pos<0 ? 0 : pos ];
					pos = 'before'; 
				}
			}

			pos = pos_map[pos] || 0;
			
			this.parent = pos&1 ? ref_node.parentNode : ref_node;
			
			this.first = pos&1 ? 
				pos&6 ? ref_node.previousSibling : ref_node
					: 
				pos&6 ? null : ref_node.lastChild;

			this.last = pos&1 ? 
				(pos^2)&6 ? ref_node.nextSibling : ref_node
					: 
				(pos^2)&6 ? null : ref_node.firstChild;
		}, {
			isEmpty: function() {
				return this.last == ( this.first ? this.first.nextSibling : this.parent.firstChild );
			},

			nodes: function() {
				return _getNodes( 
					this.first ? this.first.nextSibling : this.parent.firstChild,
					this.last
				);
			},

			inner: function() {
				if( this.first && this.first.nextSibling === this.last ||
					this.last  && this.last.previousSibling === this.first )
						return new _innerContext( null, null, this.parent );
				else 	return new _innerContext(
							this.first ? this.first.nextSibling    : this.parent.firstChild,
							this.last  ? this.last.previousSibling : this.parent.lastChild,
							this.parent
				);
			},

			place: function( what, pos ) {
				var old;
				if( !pos || pos === 'replace' ) {
					old = this.nodes();
					old.orphan();
					pos = 'before';
				}

				if( pos === 'before' )
						d.place( what, this.first || this.parent, this.first ? 'after' : 'first' );
				else	d.place( what, this.last || this.parent, this.last ? 'before' : 'last' );

				return old;
			}
		}
	);

	var valid_pos_types = { string: 1, number: 1 };

	d.declare( 'dojox.jtlc._CHTTemplateInstance', null, {

		constructor: function( bag ) {
			d.mixin( this, bag );
		},

		toString: function() {
			return this._split_text.join('');
		},

		toDom: function() {
			return d._toDom( this.toString() );
		},

		refs: function( outer ) {
			outer = outer || {};

			if( this._refs )
				outer[this._refID] = this._refs;

			d.forEach( this._split_text, function(t) {
				if( t instanceof dj._CHTTemplateInstance )	t.refs( outer );
			} );

			return outer;
		},

		toParsedDom: function( options ) {

			var	master = d.create( 'div' ),
				g = d.global;

			d.place( this.toDom(), master, 'only' );

			var	old_refs = g._refs;
			g._refs = this.refs();

			var l = d.parser.parse( master, options );

			if( old_refs )	g._refs = old_refs;
			else			g._refs = {}; // IE throws a hissy fit on delete 

			if( options && options.instances )	
				Array.prototype.push.apply( options.instances, l );

			if( master.childNodes.length == 1 )
				return master.removeChild( master.firstChild );

			var dom = d.doc.createDocumentFragment();
			while( master.firstChild )	
				dom.appendChild( master.removeChild( master.firstChild ) );

			return dom;
		},

		isDeferred: function() { return false; },
		canUpdateDom: function() { return false; },
		update: function() {},

		place: function( /* { ref_node [, pos] | outer_ctx } [, options ] */ ) {

			var	ref_node, pos, outer_ctx, transition, options,
				argn = 0;

			if( arguments[argn] instanceof _outerContext )
				outer_ctx = arguments[argn++];
			else {
				ref_node = d.byId( arguments[argn++] );
				if( valid_pos_types[ typeof arguments[argn] ] )
						pos = arguments[argn++];
				else	pos = 'last';
			}

			if( typeof arguments[argn] === 'object' )
				options = arguments[argn];

			var	opts = d.mixin(
				options ? d.mixin( {}, options ) : {},
				{ noStart: true, instances: [] }
			);

// Step 1: destroy widgets associated with the part of DOM being replaced
			if( ref_node ) {
				if( pos === 'only' || pos === 'replace' )
					_cleanupWidgets( ref_node, pos === 'only' && dijit.byNode( ref_node ) );
			} else	_cleanupWidgets( outer_ctx.nodes() );

// Step 2: build and parse new DOM
			var dom = this.toParsedDom( opts );

			if( options && options.instances )
				Array.prototype.push.apply( options.instances, opts.instances );

// Sync vs async completion: if transition requested, start it. 
			if( this._transition )
				return this._beginTransition( 
					outer_ctx || new _outerContext( ref_node, pos ), dom, opts.instances
				);

// Step 3: replace the DOM fragment

			if( ref_node )	d.place( dom, ref_node, pos ); // Should work faster
			else			outer_ctx.place( dom );

// Step 4: start up widgets

			if( !(options && options.noStart) )	
				_startupWidgets( opts.instances );

			return outer_ctx || opts.returnContext && new _outerContext( ref_node, pos );
		},

		render: function() {
			var result = this.place.apply( this, arguments );
			return this._transitionCompletion || result;
		},

		_beginTransition: function( outer_ctx, dom, instances ) {
			var tr = this._transition( outer_ctx, dom, this );
			delete this._transition;
			this._transitionCompletion = d.when( tr, d.hitch( this, '_endTransition', instances ) );
			return outer_ctx;
		},

		_endTransition: function( instances, result ) {
			_startupWidgets( instances );
			return result;
		} 
	});

	function deferred() { this._data = []; }

	function enum_deferred( stop_if, default_result ) {

		return function( cb, self ) {

			if( self )	cb = d.hitch( self, cb );

			var	dd = this._data;

			for( var i=0; i<dd.length; ++i )
				if( dd[i] ) 
					for( var j=0; j<dd[i].length; ++j ) {
						var v = cb( dd[i][j][0], i, j, dd[i][j][1] );
						if( stop_if( v ) )	return v;
					}

			return default_result;
		}				
	}

	dj._CHTDeferredAccessor = d.extend( 
		function( scope, self ){

			this.indices = [];

			if( '$CHT' in scope && // IE8 doesn't have window.hasOwnProperty()!
				scope.hasOwnProperty( '$CHT' ) && scope.$CHT._self === self 
			) {
				this.instance = scope.$CHT;
				this.storage  = this.instance._deferred;
				for( var i=0; i<this.storage._data.length; ++i )
					this.indices.push( 0 );
			} else	this.storage = new dj._CHTDeferred();
		}, {
			has: function( index ) {
				return index in this.indices && 
					   index in this.storage._data && 
					   this.indices[index] in this.storage._data[index];
			},

			get: function( index ) {	
				// Assert: has( index ) == true
				var v = this.storage._data[index][ this.indices[index]++ ][0];
				if( v instanceof dj._CHTIncrementalTemplateInstance && v._dirty )
					v.update();
				return v;
			},

			set: function( index, value, handle_errors ) {
	
				// FIXME: Hard to avoid without changing much of the flow.
				value = _syncResolve( value );

				if( !(index in this.indices) )	this.indices[index] = 0;
				if( this.instance )
					this.instance._attach( value, index, this.indices[index], handle_errors );
				if( !this.has( index ) )
					this.storage.set( index, this.indices[index], value, handle_errors );
				return this.storage._data[index][ this.indices[index]++ ][0];
			}
		} 
	);

	dj._CHTDeferred = d.extend( deferred, {
		set: function( index, subindex, value, handle_errors ) { 
			var d = this._data;
			if( !(index in d) )	d[index] = [];
			d[index][subindex] = [value,handle_errors]; 
		},

		forEach: 	enum_deferred( function(){ return false; } ),
		some: 		enum_deferred( function(x){ return x; }, false ),
		every: 		enum_deferred( function(x){ return !x; }, true )
	} );

/*
	_CHTIncrementalTemplateInstance serves as a context object for the evaluator function.
	The latter updates its _refs and _split_text members and relies on changes in
	_deferred in order to generate intermediate as well as final results.
*/

	d.declare( 'dojox.jtlc._CHTIncrementalTemplateInstance', [ dj._CHTTemplateInstance, d.Deferred ], {

		constructor: function() {
			if( this.isDeferred() )
				this._deferred.forEach( this._attach, this );
			this._dirty = false;

			if( _isDefaultThis( this._this ) )
				delete this._this;

			//	dojo.Deferred is not a well-behaved object!
			var	_then = this.then;
			this.then = function( onresolve ) {
				return this.isDeferred() ? _then.apply( this, arguments ) : onresolve( this );
			}
		},

		_attach: function( i, index, subindex, handle_errors ) {

			if( i instanceof dj._CHTIncrementalTemplateInstance ) {
				if( i.isDeferred() ) 
					i.then(
						d.hitch( this, '_onNestedReady' ),
						d.hitch( this, '_onNestedFailed' ),
						d.hitch( this, '_onNestedReady' )
					);
			} else if( i.then ) {
				var	wait_ready = d.hitch( this, '_onWaitReady', index, subindex );
				this._sync = true;
				i.then( wait_ready, handle_errors ? wait_ready : d.hitch( this, '_onWaitFailed' ) );
				delete this._sync;
			}
		},

		isDeferred: function() {
			return this._dirty && this._deferred._data.length < this._max_deferred || this._deferred.some( function(i){ 
				return i && (i instanceof dj._CHTIncrementalTemplateInstance ? i.isDeferred() : i.then);
			} );
		},

		toString: function() {
			if( this._marker_query && !this.isDeferred() ) {
				this._split_text.shift();
				this._split_text.pop();
				delete this._marker_query;
			}

			return this._split_text.join('');
		},

		_propagateReady: function() {
			var def = this.isDeferred();

			if( def )	
				this.progress( this );
			else
		 		this.resolve( this );
		},

		_onNestedReady: function( who ) {
			if( !who.canUpdateDom() )	
				this._dirty = true;
			this._propagateReady();
		},

		_onNestedFailed: function( err ) {
			this.reject( err );
		},

		_onWaitReady: function( index, subindex, value ) {
			this._deferred.set( index, subindex, value );
			if( !this._sync ) {
				this._dirty = true;
				this._propagateReady();
			}
		},

		_onWaitFailed: function( err ) {
			this.reject( err );
		},

		canUpdateDom: function( always ) {
			return '_marker_query' in this ||
					!this._dirty && 
					this._deferred.every( function(i){ 
						return i instanceof dj._CHTIncrementalTemplateInstance ? i.canUpdateDom() : !( always && i.then );
					} );
		},

		update: function() {
			var	_this = { $CHT: this };
			this._self.apply( this._this ? d.delegate( this._this, _this ) : _this, this._args );
			this._dirty = false;
		},

		_beginTransition: function( outer_ctx ) {
			if( this._innerCtx )	
				this._innerCtx = outer_ctx.inner();

			return this._activeTransition = this.inherited( arguments );
		},

		_endTransition: function( _, result ) {
			if( this._innerCtx ) {
				if( result instanceof _innerContext )
					this._innerCtx = result;
				else if( result instanceof _outerContext )
					this._innerCtx = result.inner();
			}
			delete this._activeTransition;

			return this.inherited( arguments );
		},

		_stopTransition: function() {
			if( this._activeTransition ) {
				this._activeTransition.cancel();
				delete this._activeTransition;
				delete this._transitionCompletion;
			}
		},

		updateDom: function( root, options ) {

			var	ctx = this._innerCtx, result;

			if( ctx )	root = ctx.parent;

			if( !this._dirty && (!ctx || options && options.canUpdateDom || this.canUpdateDom()) ) {

				var	wait_for = [], any = false;

				this._deferred.forEach( function(i) {
					if( i instanceof dj._CHTIncrementalTemplateInstance ) {
						var wf = i.updateDom( root, options ); // Should be able to, since canUpdateDom() checks it recursively
						if( wf )	any = true;
						if( wf.then )	wait_for.push( wf );
					}
				} );

				if( !this.isDeferred() && this._marker_query ) {
					d.query( this._marker_query, root ).forEach( function(m) {
						m.parentNode.removeChild( m );
					} );
					delete this._marker_query;
				}

				return wait_for.length == 1 ? wait_for[0] :
					   wait_for.length > 1  ? new d.DeferredList( wait_for ) :
											  any;
			}

			this._stopTransition();

			if( !ctx ) {
				if( !this._marker_query )
					throw Error( "DOM cannot be updated: context is not available" );

				var markers = d.query( this._marker_query, root );
				if( markers.length != 2 )
					(dojo.config.isDebug || dojo.config.jtlcIsReadable) &&
						console.warn("DOM cannot be updated: CHT markers disappeared" );
				else
					ctx = (new _innerContext( markers[0], markers[1] ));
			}

			if( ctx ) {
				this.update();
				result = this.place( ctx = ctx.outer(), options );
			
				if( !this._activeTransition && this._innerCtx )
					this._innerCtx = ctx.inner();
			}

			return result || true;
		},

		render: function( /* { ref_node [, pos] | outer_ctx } [, options] */ ) {

			var	args = [ arguments[0] ];
			if( !(args[0] instanceof _outerContext) ) {
				if( valid_pos_types[typeof arguments[1]] )
					args.push( arguments[1] ); 
			}

			var options = arguments.length > args.length && arguments[ args.length ] || null;
			args.push( d.mixin( {}, options, { returnContext: true } ) );

			var	ctx = this.place.apply( this, args );
			if( !this.isDeferred() )
				return this._transitionCompletion || ctx;

			if( !this.canUpdateDom( true ) )
				this._innerCtx = ctx.inner();

			var	upd = d.hitch( 
				this, 'updateDom', 
				!this._innerCtx && ctx.parent,
				!this._innerCtx ? d.mixin( {}, options, { canUpdateDom: true } ) : options
			);

			var result= d.when( this, upd, null, upd ),
				trans = this._transitionCompletion;

			return trans && result.then( function(){ return trans; } ) || result;
		}
	});
})();

