dojo.provide( "dojox.jtlc.CHT.instance" );

dojo.require( "dojo.parser" );
dojo.require( "dijit._Widget" );

dojox.jtlc._cleanupWidgets = function( ref_node, ref_w ) {
	if( ref_node.nodeType != 1 )	return;
	// It would be better to check for dojoType, but unfortunately dijit.byNode() does
	// not handle stray nodes gracefully.
	dojo.query( '[widgetId]', ref_node ).forEach( function( node ) {
		var w = dijit.byNode( node );
		if( w && ref_w !== w )	w.destroy();
	} );
};

dojox.jtlc._cleanupRange = function( from, to ) {
	while( from && from !== to ) {
		var next = from.nextSibling;
		dojox.jtlc._cleanupWidgets( from.parentNode.removeChild( from ) );
		from = next;
	}
};

(function() {

	var pos_map = { // 1: up, 2: previous, 4: replace
		before: 3,
		after:	1,
		replace:5,
		only: 	4,
		first: 	2,
		last: 	0
	};

	dojox.jtlc._placementContext = dojo.extend( 
		function( ref_node, pos ) {
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
			contract: function() {
				if( this.first && this.first.nextSibling === this.last ||
					this.last  && this.last.previousSibling === this.first ) {
					this.first = this.last = null;
				} else {
					this.first = this.first ? this.first.nextSibling    : this.parent.firstChild;
					this.last  = this.last  ? this.last.previousSibling : this.parent.lastChild;
				}
			},

			expand: function() {
				this.parent = this.first.parentNode;
				this.first = this.first.previousSibling;
				this.last  = this.last.nextSibling;
			}
		}
	);
})();

dojo.declare( 'dojox.jtlc._CHTTemplateInstance', null, {

	constructor: function( bag ) {
		dojo.mixin( this, bag );
	},

	toString: function() {
		return this._split_text.join('');
	},

	toDom: function() {
		return dojo._toDom( this.toString() );
	},

	refs: function( outer ) {
		outer = outer || {};
		if( this._refs ) {
			outer[this._refID] = this._refs;
			dojo.forEach( this._split_text, function(t) {
				if( t instanceof dojox.jtlc._CHTTemplateInstance )	t.refs( outer );
			} );
		}
		return outer;
	},

	toParsedDom: function( options ) {

		var	master = dojo.create( 'div' );

		dojo.place( this.toDom(), master, 'only' );

		var	old_refs = dojo.global._refs;
		dojo.global._refs = this.refs();

		var l = dojo.parser.parse( master, options );

		if( old_refs )	dojo.global._refs = old_refs;
		else			dojo.global._refs = {}; // IE throws a hissy fit on delete 

		if( options && options.instances )	
			Array.prototype.push.apply( options.instances, l );

		if( master.childNodes.length == 1 )
			return master.removeChild( master.firstChild );

		var dom = dojo.doc.createDocumentFragment();
		while( master.firstChild )	
			dom.appendChild( master.removeChild( master.firstChild ) );

		return dom;
	},

	isDeferred: function() { return false; },
	canUpdateDom: function() { return false; },

	place: function( ref_node, pos, options ) {

		ref_node = dojo.byId( ref_node );

		switch( typeof pos ) {
			case 'object':		options = pos;
			case 'undefined':	pos = 'last';
		}

		var	opts = dojo.mixin(
			options ? dojo.mixin( {}, options ) : {},
			{ noStart: true, instances: [] }
		);

		var dom = this.toParsedDom( opts ),
			ref_w = pos == 'only' && dijit.byNode( ref_node ),
			ctx = opts.returnContext && new dojox.jtlc._placementContext( ref_node, pos );

		if( pos == 'only' || pos == 'replace' )
			dojox.jtlc._cleanupWidgets( ref_node, ref_w );

		dojo.place( dom, ref_node, pos );

		// The following code has been lifted from dojo.parser as there's no convenience API for it
		if( !(options && options.noStart) )	
			dojo.forEach( opts.instances, function(instance){
				if(	instance && instance.startup &&	!instance._started && 
					(!instance.getParent || !instance.getParent())
				){
					instance.startup();
				}
			});
		
		if( options && options.instances )
			Array.prototype.push.apply( options.instances, opts.instances );

		if( ctx ) {
			ctx.contract();
			return ctx;
		}
	},

	render: function( ref_node, pos, options ) {
		this.place( ref_node, pos, options );
		return this;
	}
});

(function(){
	function deferred() { this._data = []; }

	function enum_deferred( stop_if, default_result ) {

		return function( cb, self ) {

			if( self )	cb = dojo.hitch( self, cb );

			var	d = this._data;

			for( var i=0; i<d.length; ++i )
				if( d[i] ) 
					for( var j=0; j<d[i].length; ++j ) {
						var v = cb( d[i][j], i, j );
						if( stop_if( v ) )	return v;
					}

			return default_result;
		}				
	}

	dojox.jtlc._CHTDeferredAccessor = dojo.extend( 
		function( instance ){

			this.indices = [];

			if( '_cht_deferred' in instance ) {
				this.instance = instance;
				this.storage  = instance._cht_deferred;
				for( var i=0; i<this.storage._data.length; ++i )
					this.indices.push( 0 );
			} else	this.storage = new dojox.jtlc._CHTDeferred();
		}, {
			has: function( index ) {
				return index in this.indices && 
					   index in this.storage._data && 
					   this.indices[index] in this.storage._data[index];
			},

			get: function( index ) {	
				// Assert: has( index ) == true
				return this.storage._data[index][ this.indices[index]++ ];
			},

			set: function( index, value ) {
				if( !(index in this.indices) )	this.indices[index] = 0;
				if( this.instance )	this.instance._attach( value, index, this.indices[index] );
				this.storage.set( index, this.indices[index]++, value );
			}
		} 
	);

	dojox.jtlc._CHTDeferred = dojo.extend( deferred, {
		set: function( index, subindex, value ) { 
			var d = this._data;
			if( !(index in d) )	d[index] = [];
			d[index][subindex] = value; 
		},

		forEach: 	enum_deferred( function(){ return false; } ),
		some: 		enum_deferred( function(x){ return x; }, false ),
		every: 		enum_deferred( function(x){ return !x; }, true )
	} );
})();

/*
	_CHTIncrementalTemplateInstance serves as a context object for the evaluator function.
	The latter updates its _refs and _split_text members and relies on changes in
	_cht_deferred in order to generate intermediate as well as final results.
*/

dojo.declare( 'dojox.jtlc._CHTIncrementalTemplateInstance', [ dojox.jtlc._CHTTemplateInstance, dojo.Deferred ], {

	constructor: function() {
		this._cht_deferred.forEach( this._attach, this );
		this._dirty = false;
	},

	_attach: function( i, index, subindex ) {

		if( i instanceof dojox.jtlc._CHTIncrementalTemplateInstance )
			i.then(
				dojo.hitch( this, '_onNestedReady' ),
				dojo.hitch( this, '_onNestedFailed' ),
				dojo.hitch( this, '_onNestedReady' )
			);
		else if( i instanceof dojo.Deferred )	
			i.then( 
				dojo.hitch( this, '_onWaitReady', index, subindex ),
				dojo.hitch( this, '_onWaitFailed' )
			);
	},

	isDeferred: function() {
		return this._dirty && this._cht_deferred._data.length < this._max_deferred || this._cht_deferred.some( function(i){ 
			return i instanceof dojox.jtlc._CHTIncrementalTemplateInstance ? i.isDeferred() : i instanceof dojo.Deferred;
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

		if( def )	this.progress( this );
		else		this.resolve( this );
	},

	_onNestedReady: function( who ) {
		if( !who.canUpdateDom() )	this._dirty = true;
		this._propagateReady();
	},

	_onNestedFailed: function() {
		this.reject( this );
	},

	_onWaitReady: function( index, subindex, value ) {
		this._cht_deferred.set( index, subindex, value );
		this._dirty = true;
		this._propagateReady();
	},

	_onWaitFailed: function() {
		this.reject( this );
	},

	canUpdateDom: function( always ) {

		return '_marker_query' in this ||
				!this._dirty && 
				this._cht_deferred.every( function(i){ 
					return i instanceof dojox.jtlc._CHTIncrementalTemplateInstance ? i.canUpdateDom() : !( always && i instanceof dojo.Deferred );
				} );
	},

	updateDom: function( root, options ) {
		
		if( !this._dirty ) {
			this._cht_deferred.forEach( function(i) {
				if( i instanceof dojox.jtlc._CHTIncrementalTemplateInstance )
					i.updateDom( root, options ); // Should be able to, since canUpdateDom() checks it recursively
			} );

			if( !this.isDeferred() && this._marker_query ) {
				dojo.query( this._marker_query, root ).forEach( function(m) {
					m.parentNode.removeChild( m );
				} );
				delete this._marker_query;
			}

			return this;
		}

		var markers = dojo.query( this._marker_query, root );
		if( markers.length != 2 )	
			throw Error( "DOM cannot be updated: CHT markers disappeared" );

		dojox.jtlc._cleanupRange( markers[0].nextSibling, markers[1] );

		if( !markers[0].nextSibling )	throw Error( "CHT markers do not have the same parent" );
		markers[0].parentNode.removeChild( markers[1] );

		this._self.apply( this, this._args );
		this._dirty = false;

		this.place( markers[0], 'replace', options );

		return this;
	},

	render: function( ref_node, pos, options ) {

		var opts = dojo.mixin( {}, options );
		opts.returnContext = true;

		var	ctx = this.place( ref_node, pos, opts );

		if( !this.isDeferred() )	
			return this;

		if( this.canUpdateDom( true ) )
			return dojo.when(
				this,
				dojo.hitch( this, 'updateDom', ctx.parent, options ),
				null,
				dojo.hitch( this, 'updateDom', ctx.parent, options )
			);

		if( !ctx.first )
			throw Error( "No DOM nodes produced by first execution of the template -- cannot render it incrementally" );

		function replaceDom( self ) {

			if( self.canUpdateDom() )
				return self.updateDom( ctx.parent, options );

			var	first = ctx.first, last = ctx.last;
			ctx.expand();
			dojox.jtlc._cleanupRange( first, last.nextSibling );

			self._self.apply( self, self._args );

			if( ctx.first )	self.place( ctx.first, 'after', options );
			else			self.place( ctx.parent, 'first', options );
			ctx.contract();
		
			self._dirty = false;

			return self;
		}

		return dojo.when( this, replaceDom, null, replaceDom );
	},
	
	then: function( onresolve ) {
		return this.isDeferred() ? this.inherited( arguments ) : onresolve( this );
	}
});


