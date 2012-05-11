/*
	Copyright (c) 2005-2011, The Dojo Foundation
	All rights reserved.

	Redistribution and use in source and binary forms, with or without
	modification, are permitted provided that the following conditions are met:

	  * Redistributions of source code must retain the above copyright notice, this
		list of conditions and the following disclaimer.
	  * Redistributions in binary form must reproduce the above copyright notice,
		this list of conditions and the following disclaimer in the documentation
		and/or other materials provided with the distribution.
	  * Neither the name of the Dojo Foundation nor the names of its contributors
		may be used to endorse or promote products derived from this software
		without specific prior written permission.

	THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
	ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
	WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
	DISCLAIMED.  IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
	FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
	DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
	SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
	CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
	OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
	OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/

// Copyright (C) 2010-2011 Adstream Holdings
// All rights reserved.
// Redistribution and use are permitted under the modified BSD license
// available at https://github.com/MaxMotovilov/adstream-js-frameworks/wiki/License

var empty = {},
	d = module.exports = {

		extend: function(/*Object*/ constructor, /*Object...*/ props){
			// summary:
			//		Adds all properties and methods of props to constructor's
			//		prototype, making them available to all instances created with
			//		constructor.
			for(var i=1, l=arguments.length; i<l; i++){
				d._mixin(constructor.prototype, arguments[i]);
			}
			return constructor; // Object
		},

		mixin: function(/*Object*/obj, /*Object...*/props){
			// summary:
			//		Adds all properties and methods of props to obj and returns the
			//		(now modified) obj.
			//	description:
			//		`dojo.mixin` can mix multiple source objects into a
			//		destination object which is then returned. Unlike regular
			//		`for...in` iteration, `dojo.mixin` is also smart about avoiding
			//		extensions which other toolkits may unwisely add to the root
			//		object prototype
			//	obj:
			//		The object to mix properties into. Also the return value.
			//	props:
			//		One or more objects whose values are successively copied into
			//		obj. If more than one of these objects contain the same value,
			//		the one specified last in the function call will "win".
			if(!obj){ obj = {}; }
			for(var i=1, l=arguments.length; i<l; i++){
				d._mixin(obj, arguments[i]);
			}
			return obj; // Object
		},

		isString: function(/*anything*/ it){
			//	summary:
			//		Return true if it is a String
			return (typeof it == "string" || it instanceof String); // Boolean
		},

		_toArray: function( args, offs ) {
			return Array.prototype.slice.call( args, offs );
		},

		_hitchArgs: function(scope, method /*,...*/){
			var pre = d._toArray(arguments, 2);
			var named = d.isString(method);
			return function(){
				// arrayify arguments
				var args = d._toArray(arguments);
				// locate our method
				var f = named ? (scope||d.global)[method] : method;
				// invoke with collected args
				return f && f.apply(scope || this, pre.concat(args)); // mixed
			}; // Function
		},

		hitch: function(/*Object*/scope, /*Function|String*/method /*,...*/){
			//	summary:
			//		Returns a function that will only ever execute in the a given scope.
			//		This allows for easy use of object member functions
			//		in callbacks and other places in which the "this" keyword may
			//		otherwise not reference the expected scope.
			//		Any number of default positional arguments may be passed as parameters
			//		beyond "method".
			//		Each of these values will be used to "placehold" (similar to curry)
			//		for the hitched function.
			//	scope:
			//		The scope to use when method executes. If method is a string,
			//		scope is also the object containing method.
			//	method:
			//		A function to be hitched to scope, or the name of the method in
			//		scope to be hitched.
		
			if(arguments.length > 2){
				return d._hitchArgs.apply(d, arguments); // Function
			}
			if(!method){
				method = scope;
				scope = null;
			}
			if(d.isString(method)){
				scope = scope || d.global;
				if(!scope[method]){ throw(['dojo.hitch: scope["', method, '"] is null (scope="', scope, '")'].join('')); }
				return function(){ return scope[method].apply(scope, arguments || []); }; // Function
			}
			return !scope ? method : function(){ return method.apply(scope, arguments || []); }; // Function
		},

		delegate: (function(){
		
			// boodman/crockford delegation w/ cornford optimization
			function TMP(){}
			return function(obj, props){
				TMP.prototype = obj;
				var tmp = new TMP();
				TMP.prototype = null;
				if(props){
					d._mixin(tmp, props);
				}
				return tmp; // Object
			};
		})(),
	
		_mixin: function(/*Object*/ target, /*Object*/ source){
			// summary:
			//		Adds all properties and methods of source to target. This addition
			//		is "prototype extension safe", so that instances of objects
			//		will not pass along prototype defaults.
			var name, s, i;
			for(name in source){
				// the "tobj" condition avoid copying properties in "source"
				// inherited from Object.prototype.  For example, if target has a custom
				// toString() method, don't overwrite it with the toString() method
				// that source inherited from Object.prototype
				s = source[name];
				if(!(name in target) || (target[name] !== s && (!(name in empty) || empty[name] !== s))){
					target[name] = s;
				}
			}

			return target; // Object
		}
};
