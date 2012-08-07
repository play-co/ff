# <img src="http://f.cl.ly/items/3K113g321o0n0W0Y0Z33/Fast%20Forward%20Icon%20in%2032x32%20px.png" width=25 height=25> ff: Concise, Powerful Asynchronous JavaScript Flow Control

***ff* simplifies the most common use cases for series, parallel, and
promise utilities.** 

#### Installation

- Node.JS: `npm install ff`
- Browsers: Add `lib/ff.js` to your HTML page.

## Table of Contents

- [Intro](#intro)
- **[API Documentation](#api-documentation)**
- [Advanced Usage](#advanced-usage)
- [Promise API](#promise-api-deferreds)
- **[Quick Reference & Cheat Sheet](#quick-reference--cheat-sheet)**

## Intro

Here's a brief example that shows both serial and parallel steps:

```javascript
var f = ff(this, function () {
    fs.readFile("1.txt", f());
    fs.readFile("2.txt", f());
}, function (fileA, fileB) {
    concatFiles(fileA, fileB, f());
}, function (result) {
    f(result.toUpperCase());
}).cb(cb);
```

It also supports promises, using the `ff.defer` function [[docs]](#promise-api-deferreds):

```javascript
var f = ff.defer(this);

f.success(function(result, result2) { });
f.error(function (err) { });

f(result, result2); // or f.fail(err);
```

A typical Express web handler looks like this. (Note that even if an
exception gets thrown during one of these handlers, the .error()
handler will be called.

```javascript
function (req, res, next) {
    var f = ff(function() {
        authenticateUser(req, f());
    }, function (user) {
        f(user); // pass the user along synchronously
        user.getFriends(f());
    }, function (user, friends) {
        res.json({ user: user, friends: friends });
    }).error(next); // call next() *only* on error
}
```

---

# API Documentation

## First, call `ff` and save its return value (as `f`, perhaps).

#### `var f = ff([context], stepFunctions... )`
    
The ``ff`` function takes a context and any number of
functions, which we call "steps". Each step is run one at a time. Use
`ff`'s return value (often called `f`) to create callbacks for any
async functions used in each step.

## Second, use the returned `f` object inside each step function.

**Within your step functions, pass `f()` as the callback parameter to
any async function.** This reserves a "slot" in the next step's
function arguments. For instance:

```javascript
	fs.readFile("1.txt", f()); // fs.readFile will use that as a callback.
```

Most often, that's all you'll need, but there are other ways to pass
data:

```javascript
	f(data); // pass data synchronously to the next function
	fs.exists("1.txt", f.slotPlain()); // fs.exists doesn't pass (err, result), just (result)
	emitter.once("close", f.wait()); // just wait for the "close" event
```

### All Methods on `f`:

#### `f()`

Calling `f()` reserves a slot in the next step's function arguments,
and returns a callback that you should pass into an async function.
The async function should be called with an error as in `callback(err,
result)`.

#### `f(arg1, arg2...)`

If you call `f` with arguments, those arguments will be passed into
the next step. This can be useful when you need to pass along a value
directly to the next function synchronously.

#### `f.wait()`

Sometimes you don't want to pass any arguments to the next function,
but you just want to wait until an async call completes successfully.
This behaves exactly like `f()`, handling errors, but no arguments are
passed to the next step.

#### `f.slotPlain()`

This is like `f()`, except that the resulting callback must *not*
accept an error, as in `callback(result)`. Node's `fs.exists` doesn't
return an error, for instance, and so you must use `f.slotPlain()` for
its callback instead. (If you had used `f.slot()`, it would have
thought `fs.exists` had passed an *error* as the first argument.

#### `f.waitPlain()`

See `f.slotPlain()`. Like `f.wait()`, this does not pass any
arguments to the next step.

#### `f.slotMulti(n)`

Like `f()`, except that the resulting callback will pass `n` arguments
to the next step instead of just one. For instance, calling `var cb =
f.slotMulti(2)` followed by `cb(err, rsp, body)` would pass both `rsp`
and `body` as two arguments to the next step.

#### `f.group()`

This reserves exactly one slot in the next step, and returns a group
object that has all of the above methods. Anything you slot or pass
into the group gets passed into the next function's argument list *as
an array*. (See the Groups example.)

#### `f.succeed(successArgs...)`

This causes the chain of steps to end successfully (after you return
from the current function). The result handlers (`.success()` and
`.cb()`) will be called as soon as the current step returns. No other
steps will be executed afterward.

#### `f.fail(err)`

This causes the chain of steps to end as though the given error had
occurred (after you return from the current function). The result
handlers (`.error()` and `.cb()`) will be called as soon as the
current step returns. No other steps will be executed afterward.

#### `f.next(fn)`

You can add additional steps after calling `ff()` using `f.next(fn)`.
Internally, we pass the arguments through this function initially.

## Finally, remember to handle the result! (`.cb`, `.error`, `.success`)

After you've called `ff()` with your steps, you'll want to handle the
final result that gets passed down the end of the function. We often
do this like so:

```javascript
var f = ff(
   // steps here...
).cb(cb);
```

That final callback will be passed arguments node-style: `cb(err,
results...)`. (The number of arguments after `err` depends on how many
slots you've passed from the last function in the chain.) This lets
you use ff within any part of your code without expecting any other
function to know that `ff` exists in your own code.

There are three ways you can handle the final result (you can mix and
match):

#### `f.cb( function (err, results...) { } )`

A `.cb()` result handler will *always* be called, whether or not an
error occurred. An error object will be passed first (null if there
was no error.)

#### `f.success( function (results...) {} )`

A `.success()` handler will *only* be called if no error occured.
Additionally, an error object will *not* be passed. Only results.

#### `f.error( function (err) {} )`

A `.error()` result handler will *only* be called if an error occured.
In this case, `err` will never be null. (If you're using Express,
often we use `.error(next)` to propagate whenever we didn't reach a
call to `res.send()`.)

**Always remember to add one of these result handlers after your
`ff()` call, so that errors propagate!** You can add multiple result
handlers and they will all be called simultaneously. 

### Error Handling

If any function throws an exception, or an error gets passed to one of
the callbacks (as in `callback(err, result)`), the error will be
propagated immediately to your result handlers (`.cb()` and
`.error()`). If a result handler throws an exception, that exception
will bubble up into Node's `unhandledException` handler or the
browser's developer console.

---

# Advanced Usage

### Groups (for processing arrays)

The `f.group()` method reserves exactly one slot in the next step and
returns an object just like `f`. Anything you slot or pass into the
group gets passed into the next function's argument list *as an
array*. This is useful for processing arrays of items. Here's an example:

```javascript
var allMyFiles = ["one.txt", "two.txt", "three.txt"];

var f = ff(function() {
    var group = f.group();
    allMyFiles.forEach(function (file) {
        fs.readFile(file, group());
    });
}, function (allFiles) {
    // allFiles is an array of 3 items (the contents of each file).
    
    // If any call had returned an err, this function would not be
    // called, and the error would have been passed down to `cb`.
}).cb(cb);
```

### Implementation Details

The following are equivalent:

```javascript
var f = ff(this,
	one,
	two,
).cb(three);
```

```javascript
var f = ff(this);
f.next(one);
f.next(two);
f.cb(three);
```

Error handling is actually quite simple: If an error occurs in any
step, it gets passed down, skipping over any `.next` handlers.

---

# Promise API (Deferreds)

Because of the implementation details we just described, `ff` doubles
as a simple promise library using a very similar API. All you need to
remember is to call `ff.defer()` instead of `ff()`.

```javascript
var f = ff.defer(this);

// set callbacks:
f.success(function(result, result2) { });
f.error(function (err) { });

// now trigger the result:
f(result, result2); // or f.fail(err);
```

To trigger success or failure:

```javascript
f(arg1, arg2...) // success
f.fail(err)      // failure
```

Just like with a regular `ff` call, you can attach `.success()`,
`.error()`, and `.cb()` handlers. 

You can also pass functions into the `ff.defer(...)` call, just like
regular `ff`:

```javascript
var f = ff.defer(function(result, text) {
	// do something with result
}, function () {
	// ...etc...
}).cb(cb);

// now fire the result into the first step!
f(result, "something else");
```

Once your chain has succeeded or failed, future `.success()` and
`.error()` handlers will remember the result and fire immediately. The
result is stored on `f.result` once available.

---
# Quick Reference / Cheat Sheet

The [API Documentation](#api-documentation) provides a much more thorough tutorial.

#### Control Flow API Summary

```javascript
// Create a chain of steps with the `ff` function:
var f = ff(context, function () {
	// Within each method, use the `f` object.
	// Most common uses:
	f(arg1, arg2); // pass multiple arguments synchronously
	fs.readFile("file1.txt", f());      // use f() for async callbacks
	fs.readFile("file2.txt", f.wait()); // just wait for the result
                                        // without putting it in args
									 
	// To process arrays, use groups:
	var group = f.group();
	allFiles.forEach(function (item) {   // use any `f` function on arrays
	    fs.readFile(item, group.slot()); // and the result gets stored as
	});                                  // an array in the next step
	
	// Less common uses for atypical functions
	fs.exists("file3.txt", f.slotPlain()); // fs.exists doesn't pass an error
	fs.exists("file4.txt", f.waitPlain()); // ditto, and I don't care if it fails
	var cb = f.slotMulti(2); // slot and pass two arguments to the next function
	                         // for example, cb(null, 1, 2);
	
	// Aborting the chain of steps early:
	f.succeed(result1, ...); // after this function, skip the other steps
	f.fail(err);             // after this function, fail with this error
}, function (arg1, arg2, file1, allFiles, file3Exists, multi1, multi2) {
	// Do something amazing here!
}).cb(cb); // <-- usually you'll have someone else handle a (err, result...) callback

// Don't forget result handlers (often chained to `ff` for conciseness)
f.cb(function (err, args...) { }); // triggered on both success and error
f.success(function (args...) { }); // only on success
f.error(function (err) { });       // only on error
```

#### Promise API Summary

```javascript
// Create a deferred
var f = ff.defer(context);
// Add result handlers:
f.success(function (args...) { });
f.error(function (err) { });
f.cb(function (err, args...) { }); // triggered on both success and error
// Trigger results: 
f(arg1, ...); // success
f.fail(err);  // failure
// Get the result synchronously, if available (the error argument is on f.result[0])
var resultArray = f.result
```

---
# Acknowledgements

Made by [Marcus Cavanaugh](http://mcav.com/) and [Michael Henretty](http://twitter.com/mikehenrty).

This code was originally based on
[Tim Caswell](mailto:tim@creationix.com)'s sketch of a
[reimagined](https://gist.github.com/1524578) [Step](https://github.com/creationix/step) library.
