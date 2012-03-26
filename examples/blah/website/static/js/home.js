dojo.provide( 'blah.home' );

dojo.require( 'dojox.jtlc.CHT.loader' );
dojo.require( 'adstream.data.Service' );
dojo.require( 'adstream.data.Watcher' );

dojo.require( 'dojo.date.locale' );

var loader = dojox.jtlc.CHT.loader;

dojo.ready( function(){

	var	ads = adstream.data.schema;

	blah.root = adstream.data.connect(
		'/svc',
		new ads.Node({

			user: new ads.Object(),
			
			topics: new ads.Container({
				item: new ads.Object({
					messages: new ads.Container({
						item: new ads.Object()
					})
				})
			})
		})
	);
	
	blah.root.service().catchAll( showNotification );
	
	blah.root.get( 'user' );
	blah.root.get( 'topics', 3 );

	dojo.when(
		loader.require( 'blah.home' ),
		renderPage
	);
})

function renderPage()
{
	loader.get( 'blah.home.Menu' )( blah.root ).render( 'menu', 'only' );
	loader.get( 'blah.home.TopicList' )( blah.root.topics ).render( 'body', 'only' );
	
	blah.root.watch( userChanged, 'user' );
	blah.root.watch( topicCreated, 'topics' );

	dojo.when( blah.root.get( 'user' ), userChanged );
}

function userChanged()
{
	loader.get( 'blah.home.LoginOrGreeting' )( blah.root ).render( 'leftMenu', 'replace' );
}

var orderTopicIDs = dojox.json.query( '[*][?messages][/messages[1].timestamp][=id()]' ),
	orderMessageIDs = dojox.json.query( '[*][/timestamp][=id()]' );

function topicCreated( topics )
{
	var new_topic_list = orderTopicIDs( topics ),
		old_topics = dojo.query( '#body div[topic_id]' ),
		n = old_topics.length;
	
	while( n < new_topic_list.length )
		loader.get( 'blah.home.Topic' )( topics[ new_topic_list[n++] ] ).render( 'body', 'last' );
}

function showNotification( err_or_msg )
{
	loader.get( 'blah.home.Notification' )(
		typeof(err_or_msg)==='string' ? err_or_msg : err_or_msg.responseText,
		typeof(err_or_msg)!=='string'
	).render( 'rightMenu', 'replace' );
}

blah.home.makeThread = function( messages )
{
	var index = {};

	function inReplyTo( m ) {
		return m.inReplyTo in messages ? m.inReplyTo : 0;
	}
	
	for( var m in messages )
		if( messages.hasOwnProperty( m ) ) {
			var i = inReplyTo( messages[m] );
			(index[i] = index[i]||[]).push( messages[m] );
		}

	function collect(level,id) {
		return id in index ? dojo.map(
			index[id], function(m) {
				return { message: m, children: collect(level+1,m.id()), level: level };
			}
		) : null;
	}
	
	return collect( 0, 0 );
}

blah.home.formatTime = function( timestamp )
{
	return dojo.date.locale.format(
		new Date( timestamp ),
		{ datePattern: "EEE", timePattern: "K:mma" }
	);
}

dojo.declare( 'blah.home.InputBox', dijit._Widget, {

	value: "",

	postCreate: function() {
		this.connect( this.domNode, 'onfocus', 'onFocus' );
		this.connect( this.domNode, 'onblur', 'onBlur' );
	},
	
	onFocus: function() {
		if( dojo.hasClass( this.domNode, 'empty' ) ) {
			dojo.toggleClass( this.domNode, 'empty' );
			this.domNode.value = '';
			this.domNode.focus();
		}
	},
	
	onBlur: function() {
		if( !this.domNode.value ) {
			dojo.toggleClass( this.domNode, 'empty' );
			this.domNode.value = this.value;			
		}
	}
});

dojo.declare( 'blah.home.Title', [dijit._Widget, adstream.data.Watcher], {

	topic_id: "",

	postCreate: function() {
		dojo.query( 'a', this.domNode ).forEach( function(a) {
			this.connect( a, 'onclick', 'expandTopic' );
		}, this );
	},
	
	expandTopic: function() {
		loader.get( 'blah.home.Topic' )( blah.root.topics.get( this.topic_id, 2 ), true ).render( this.domNode, 'replace' );
	}
});

dojo.declare( 'blah.home.Topic', [dijit._Widget, adstream.data.Watcher], {

	topic_id: "",

	postCreate: function() {
		dojo.query( 'a[collapse=true]', this.domNode ).forEach( function(a) {
			this.connect( a, 'onclick', 'collapseTopic' );
		}, this );
		
		dojo.query( 'input[type=button]', this.domNode ).forEach( function(btn) {
			this.connect( btn, 'onclick', 'reply' );
		}, this );
		
		this.watch( 'refreshAll', blah.root.user );
		this.watch( 'refreshAll', blah.root.topics[this.topic_id], 'messages' );
	},
	
	collapseTopic: function() {
		loader.get( 'blah.home.Topic' )( blah.root.topics[this.topic_id] ).render( this.domNode, 'replace' );
	},
	
	refreshAll: function() {
		loader.get( 'blah.home.Topic' )( blah.root.topics[this.topic_id], true ).render( this.domNode, 'replace' );
	},
	
	reply: function(e) {
		var new_message;
		
		while( !(new_message = dojo.query( '#body form.newMessage' )[0]) ) {
			var div = e.target.parentNode;
			loader.get( 'blah.home.NewMessage' )( { level: dojo.attr( div, 'level' ) } ).render( div, 'after' );
		}
		
		dijit.byNode( new_message ).activate();
	}
});

dojo.declare( 'blah.home.New', dijit._Widget, {

	postCreate: function() {
		this.connect( this.domNode, 'onsubmit', 'post' );
		dojo.query( 'input[name="cancel"]', this.domNode ).forEach( function(btn){
			this.connect( btn, 'onclick', 'hide' );
		}, this );
	},

	
	hide: function() {
		loader.get( 'blah.home.Nothing' )().render( this.domNode, 'replace' );
	}
} );

dojo.declare( 'blah.home.NewTopic', blah.home.New, {

	activate: function() {
		this.domNode.title.focus();
	},
	
	post: function(e) {
		dojo.stopEvent(e);
		if( dojo.hasClass( this.domNode.title, 'empty' ) )
			this.activate();
		else if( !this.domNode.message.value )
			this.domNode.message.focus();
		else {
			var topic = blah.root.topics.create();
			topic.title = this.domNode.title.value;
			var message = topic.messages.create();
			message.user = blah.root.user.name;
			message.text = this.domNode.message.value;
			message.timestamp = (new Date()).valueOf();
			topic.save();
			this.hide();
		}
	}
});

dojo.declare( 'blah.home.NewMessage', blah.home.New, {

	activate: function() {
		this.domNode.message.focus();
	},
	
	post: function(e) {
		dojo.stopEvent(e);
		if( dojo.hasClass( this.domNode.message, 'empty' ) )
			this.activate();
		else {
			var topic_id = dojo.attr( this.domNode.parentNode, 'topic_id' ),
				topic = blah.root.topics[topic_id],
				message = topic.messages.create();
			message.user = blah.root.user.name;
			message.text = this.domNode.message.value;
			message.timestamp = (new Date()).valueOf();
			message.inReplyTo = dojo.attr( this.domNode.previousSibling, 'message_id' );
			message.save();
			this.hide();
		}
	}	
	
});

dojo.declare( 'blah.home.Search', dijit._Widget, {
	
	postCreate: function() {
		this.connect( this.domNode, 'onsubmit', 'post' );
	},
	
	post: function(e) {
		dojo.stopEvent(e);
		if( dojo.hasClass( this.domNode.searchString, 'empty' ) )
			blah.root.topics.filter( {} )
		else
			dojo.mixin( blah.root.topics.filter(), { search: this.domNode.searchString.value } );
			
		dojo.when( blah.root.topics.get( '', 3 ), dojo.hitch( this, 'refreshPage' ) );
	},
	
	refreshPage: function() {
		loader.get( 'blah.home.TopicList' )( blah.root.topics, blah.root.topics.filter().search ? 'nocollapse' : false ).render( 'body', 'only' );	
	}
});

dojo.declare( 'blah.home.Notification', null, {
	constructor: function() {
		window.setTimeout(
			dojo.hitch( this, 'hideNotification' ), 3000
		);
	},
	
	hideNotification: function() {
		loader.get( 'blah.home.Search' )().render( 'rightMenu', 'replace' );
	}
});

dojo.declare( 'blah.home.Login', dijit._Widget, {

	postCreate: function() {
		this.connect( this.domNode, 'onsubmit', 'login' );
		dojo.query( 'input[name="register"]', this.domNode ).forEach( function(btn){
			this.connect( btn, 'onclick', 'register' );
		}, this );
	},
	
	login: function(e) {
		dojo.stopEvent( e );
		blah.root.user.register = false;
		if( this.saveForm() )
			blah.root.user.save();
	},

	register: function(e) {
		if( this.saveForm() ) {
			blah.root.user.register = true;
			dojo.when(
				blah.root.user.save(),
				dojo.hitch( null, showNotification, 'Registration successful, please log in' )
			);
		}
	},
	
	saveForm: function() {
		if( dojo.hasClass( this.domNode.name, 'empty' ) ||
			dojo.hasClass( this.domNode.password, 'empty' ) )
			return false;
			
		dojo.mixin(
			blah.root.user, {
				name: this.domNode.name.value,
				password: this.domNode.password.value
			}
		);
		
		return true;
	}	
});

dojo.declare( 'blah.home.Greeting', dijit._Widget, {
	postCreate: function() {
		this.connect( this.domNode, 'onsubmit', 'onPost' );
		dojo.query( 'input[name="logoff"]', this.domNode ).forEach( function(btn){
			this.connect( btn, 'onclick', 'logout' );
		}, this );
	},
	
	logout: function(e) {
		blah.root.user.save();
	},
	
	onPost: function(e) {
		dojo.stopEvent(e);
		var new_topic;
		
		while( !(new_topic = dojo.query( '#body form.newTopic' )[0]) )
			loader.get( 'blah.home.NewTopic' )().render( 'body', 'first' );
			
		dijit.byNode( new_topic ).activate();
	}
});
