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

			dependencies: [	
				"main/collect",
				"dojox/jtlc/compile",
				"dojox/jtlc/JXL",
				"dojox/jtlc/parseExpression",
				"dojox/jtlc/prettyPrint",
				"dojox/jtlc/qplus",
				"dojox/jtlc/tags",
				"dojox/jtlc/CHT",
				"dojox/jtlc/CHT/userDefinedElement",
				"dojox/jtlc/CHT/tags",
				"dojox/jtlc/CHT/instance",
				"dojox/jtlc/CHT/loader",
				"dojox/jtlc/CHT/scanner",
				"dojox/jtlc/CHT/elements",
				"dojox/jtlc/CHT/p11nAlgorithm",
				"dojox/json/query",
				"dojo/i18n",
				"dojo/promise/all",
				"dojo/DeferredList"
			],

			boot: true,
			compat: "1.6"
		}
	],

	prefixes:[
		[ "main", selfPath ],
		[ "dojox", "../dojox" ],
		[ "dijit", "../dijit" ]	
	],

	packages:[
		{
			name: "main",
			location: selfPath
		},{
			name: "dojo",
			location: "."
		},{
			name: "dijit",
			location: "../dijit"
		},{
			name: "dojox",
			location: "../dojox"
		}
	]
};

