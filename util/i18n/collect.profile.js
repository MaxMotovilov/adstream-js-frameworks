basePath="../../dojo/";

dependencies = {

	staticHasFeatures: { 
		"host-node": 1,
		"host-browser": 0,
		"dom": 0,
		"dojo-cdn": 0,
		"dojo-has-api":1,
		"dojo-xhr-factory":0,
		"dojo-inject-api":1,
		"dojo-timeout-api":0,
		"dojo-trace-api":1,
		"dojo-loader-catches":0,
		"dojo-dom-ready-api":0,
		"dojo-dom-ready-plugin":0,
		"dojo-ready-api":1,
		"dojo-error-api":1,
		"dojo-publish-privates":1,
		"dojo-gettext-api":1,
		"dojo-sniff":0,
		"dojo-loader":1,
		"dojo-test-xd":0,
		"dojo-test-sniff":0
	},

	layers: [
		{
			name: "dojo.js",
			dependencies: [	"main/collect" ],
			boot: true,
			compat: "1.6"
		}
	],

	prefixes: [
		[ "main", selfPath ],
		[ "dojox", "../dojox" ],
		[ "dijit", "../dijit" ],
		[ "dojox/jtlc", selfPath + "/../../libs/dojox/jtlc" ],
		[ "dojox/jtlc/CHT/instance", selfPath + "/dummy" ]
	]
};

