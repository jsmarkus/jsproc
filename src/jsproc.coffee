cp = require 'child_process'

addslashes = (str)->
	str.replace(/\\/g,'\\\\').replace(/\'/g,'\\\'').replace(/\0/g,'\\0')#.replace(/\"/g,'\\"')

exec = (cmd, body, cb)->
	response = []
	proc = cp.spawn cmd
	proc.stdout.on 'data', (data)->
		response.push data.toString()
	proc.on 'exit', (code)->
		if code
			cb code
		else
			cb null, response.join ''
	proc.stdin.write body.join '\n'
	proc.stdin.end()


module.exports = (input, cb)->
	lines = input.split '\n'

	resources = {}

	state = 'wait'
	resourceName = null
	resourcePipe = null
	resourceBody = []
	output = []

	step = (lines)->
		line = lines[0]
		next = ()->
			return end resources unless lines.length > 1
			step lines.slice 1

		# console.log 'state', state
		# console.log 'line', line
		output.push line
		switch state

			when 'wait'
				if line.match /^\s*@@DEFRESOURCE\s*$/gi
					resourceName = null
					resourcePipe = null
					resourceBody = []
					state = 'readResourceHeader'
					return next()

				if matches = /\/\*@@RESOURCE (\w+)\*\/'(.*)'\/\*@@\/RESOURCE\*\//gi.exec line
					do ()->
						resourceName = matches[1]
						res = resources[resourceName]
						process.exit 1 unless res
						escaped = res.escapedResult
						start = line.substr 0, matches.index
						wholeMacro = matches[0]
						subst = "/*@@RESOURCE #{resourceName}*/'#{escaped}'/*@@/RESOURCE*/"
						end   = line.substr matches.index + wholeMacro.length
						output[output.length - 1] = "#{start}#{subst}#{end}"

			when 'readResourceHeader'
				if line.match /^\s*$/gi
					if resourceName is null
						process.exit 1
					state = 'readResourceBody'
					return next()
				if matches = line.match /^\s*name:(.+)\s*$/
					resourceName = matches[1]
					return next()
				if matches = line.match /^\s*pipe:(.+)\s*$/
					resourcePipe = matches[1]
					return next()

			when 'readResourceBody'
				if line.match /^\s*@@\/DEFRESOURCE\s*$/gi
					res =
						name : resourceName
						pipe : resourcePipe
						body : resourceBody
					resources[resourceName] = res
					state = 'wait'
					return exec res.pipe, res.body, (err, result)->
						if err
							process.exit 1
							return
						res.result = result
						res.escapedResult = addslashes result
						next()

				resourceBody.push line

		return next()

	end = (resources)->
		cb output.join '\n'

	step lines