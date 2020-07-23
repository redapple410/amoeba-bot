//To-Do List Bot v3.3
//channel-specific timezones

require("dotenv").config();

const Discord = require("discord.js");
const client = new Discord.Client({disableEveryone: false});

const sqlite3 = require("sqlite3");
var db;
var curChanId = 0;

const helpText = "❓  **AMOEBA BOT COMMANDS**  ❓\n" +
                 "All lists (to-do, archive, remindable people) are channel specific!\n" +
                 "*Admin only commands are denoted by  ⛔.*\n\n" +

                 "`!todo add <due date> ; <task>` - Add a new task to the to-do list.\n" +
                 "`!todo list` - Display the current to-do list.\n" +
                 "`!todo done <task>` - Mark a task from the to-do list as done, and move it to the archive.\n" +
                 "`!todo delete <task>`, `!todo remove <task>` - Delete a task from the to-do list without archiving it.\n\n" +

                 "`!todo archive` - Display the archive of tasks.\n" +
                 "`!todo archivechannel` - Find out the archive channel for the current channel's to-do list.\n" +
                 "`!todo setarchivechannel <#channel>` - Set a new archive channel for the current channel. ⛔\n\n" +

                 "`!todo peopleadd <name> ; <@user>` - Add a person to the list of remindable people. ⛔\n" +
                 "`!todo peoplelist` - Display the list of people who can be reminded about tasks (remindable people).\n" +
                 "`!todo peopledelete <name>`, `!todo peopleremove <name>` - Delete a person from the list of remindable people. ⛔\n\n" +

                 "`!todo timezone` - Display the timezone for the current channel, as an offset from UTC.\n" +
                 "`!todo settimezone <+HH:MM>` - Set a new timezone for the current channel by specifying the offset (+/-) from UTC. ⛔\n";
const doneText = "Are you sure you want to mark this task as done and archive it?";
const deleteText = "Are you sure you want to DELETE this task without archiving it?";
const peopleDeleteText = "Are you sure you want to remove this person from the list of remindable people?"

const todoCommands = ["add ", "list", "done ", "remove ", "rm ", "delete ", "archivechannel", "setarchiveChannel", "peopleadd ", "peoplelist", "peopleremove ", "peoplerm ", "peopledelete ", "timezone", "settimezone "];

const remindTime = 60;
const snoozeTime = 86400;
const warningTime = 86400;

const filter = (react, user) => {
  return user.id != client.user.id && (react.emoji.name == "☑️" || react.emoji.name == "❌")
}

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
  db = new sqlite3.Database("./todo.db", (err) => {
		if(err){
      return console.error(err.message);
    }
    console.log("Connected to database!");
    db.run(`CREATE TABLE IF NOT EXISTS pairs (todoChan TEXT UNIQUE NOT NULL, archiveChan TEXT UNIQUE NOT NULL)`, [], (err) => {
      if(err){
        return console.error(err.message);
      }
    });
    db.run(`CREATE TABLE IF NOT EXISTS timezone (todoChan TEXT UNIQUE NOT NULL, hour INTEGER DEFAULT 0, min INTEGER DEFAULT 0)`, [], (err) => {
      if(err){
        return console.error(err.message);
      }
    });
	});
  client.user.setActivity("!todo help");
  setInterval(() => {
    let curTime = Math.floor(new Date().getTime() / 1000);
    db.each(`SELECT todoChan FROM pairs`, [], (err, row) => {
      if(err){
        return console.error(err.message);
      }
      let chan = client.channels.cache.get(row.todoChan);
      if(chan){
        db.each(`SELECT date, item, snooze FROM todo_${chan.id} ORDER BY date`, [], (err, row) => {
          if(err){
            return console.error(err.message);
          }
          let it = row.item;
          let str = "";
          if(row.snooze == 0 && curTime >= row.date - warningTime && curTime <= row.date){
            db.serialize(() => {
              db.each(`SELECT name, userid FROM people_${chan.id}`, [], (err, row) => {
                if(err){
                  return console.error(err.message);
                }
                if(it.toLowerCase().includes(row.name.toLowerCase())){
                  str += "<@" + row.userid + ">, ";
                }
              });
              db.run(``, [], () => {
                if(str == ""){
                  str = "@everyone, ";
                }
                chan.send(`🔔 Hi ${str}just a friendly reminder that \`${row.item}\` will be due in ${timeAgoString(row.date - curTime)}. If you have already completed the task, then don't forget to mark it as done!`);
                db.run(`UPDATE todo_${chan.id} SET snooze = 1 WHERE item = ?`, [row.item], (err) => {
                  if(err){
                    return console.error(err.message);
                  }
                });
              });
            });
          }
          else if(curTime >= row.date + row.snooze){
            db.serialize(() => {
              db.each(`SELECT name, userid FROM people_${chan.id}`, [], (err, row) => {
                if(err){
                  return console.error(err.message);
                }
                if(it.toLowerCase().includes(row.name.toLowerCase())){
                  str += "<@" + row.userid + ">, ";
                }
              });
              db.run(``, [], () => {
                if(str == ""){
                  str = "@everyone, ";
                }
                chan.send(`📢 Hi ${str}just a friendly reminder that \`${row.item}\` was due ${timeAgoString(curTime - row.date)} ago. If you have already completed the task, then don't forget to mark it as done!`);
                db.run(`UPDATE todo_${chan.id} SET snooze = ${curTime} + ${snoozeTime} - ${row.date} WHERE item = ?`, [row.item], (err) => {
                  if(err){
                    return console.error(err.message);
                  }
                });
              });
            });
          }
        });
      }
    });
  }, remindTime * 1000);
});

client.on("message", (msg) => {
  if(msg.author.id != client.user.id && msg.content.startsWith("!todo ")){
    curChanId = msg.channel.id;
    let command = msg.content.slice(6);
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS todo_${curChanId} (date INTEGER NOT NULL, item TEXT UNIQUE NOT NULL, snooze INTEGER DEFAULT 0)`, [], (err) => {
        if(err){
          return console.error(err.message);
        }
      });
      db.run(`CREATE TABLE IF NOT EXISTS people_${curChanId} (name TEXT UNIQUE NOT NULL, userid TEXT UNIQUE NOT NULL)`, [], (err) => {
        if(err){
          return console.error(err.message);
        }
      });
      db.run(`CREATE TABLE IF NOT EXISTS archive_${curChanId} (date INTEGER NOT NULL, item TEXT NOT NULL)`, [], (err) => {
        if(err){
          return console.error(err.message);
        }
      });
      db.run(`INSERT INTO pairs (todoChan, archiveChan) VALUES (?, ?)`, [curChanId, curChanId], (err) => {
        if(err && !err.message.includes("UNIQUE constraint failed")){
          return console.error(err.message);
        }
      });
      db.run(`INSERT INTO timezone (todoChan) VALUES (?)`, [curChanId], (err) => {
        if(err && !err.message.includes("UNIQUE constraint failed")){
          return console.error(err.message);
        }
      });
      db.get(`SELECT todoChan FROM pairs WHERE archiveChan = ?`, [curChanId], (err, row) => {
        if(err){
          return console.error(err.message);
        }

        if(row && row.todoChan != curChanId){     //this is an archive channel, and only an archive channel (not archive for itself)
          if(command.startsWith("help")){
            msg.channel.send(helpText);
          }

          else if(command.startsWith("archive") && !command.startsWith("archivechannel")){
            let str = "";
            db.get(`SELECT todoChan FROM pairs WHERE archiveChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              let todoChanId = row.todoChan;
              db.get(`SELECT hour, min FROM timezone WHERE todoChan = ?`, [todoChanId], (err, row) => {
                if(err){
                  return console.error(err.message);
                }
                db.serialize(() => {
                  db.each(`SELECT datetime(date,'unixepoch','${row.hour} hour','${row.min} minute') date, item FROM archive_${todoChanId} ORDER BY date`, [], (err, row) => {
                    if(err){
                      return console.error(err.message);
                    }
                    if(row.date.substring(11, 19) == "00:00:00"){
                      str += row.date.substring(0, 10) + " — " + row.item + "\n";
                    }
                    else{
                      str += row.date.substring(0, 16) + " — " + row.item + "\n";
                    }
                  });
                  db.run("", [], () => {
                    if(str == ""){
                      msg.channel.send(`It looks like the archive for <#${todoChanId}> is empty!`);
                    }
                    else{
                      msg.channel.send(`📁  **ARCHIVED FROM <#${todoChanId}>**  📁\n${str}`);
                    }
                  });
                });
              });
            });
          }

          else{
            for(let i = 0; i < todoCommands.length; i++){
              if(command.startsWith(todoCommands[i])){
                db.get(`SELECT todoChan FROM pairs WHERE archiveChan = ?`, [curChanId], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  msg.channel.send(`Sorry, please go to another channel like <#${row.todoChan}> to use these commands!`);
                });
                return;
              }
            }
            msg.react("❓");
          }
        }

        else{     //this is either (a) an archive channel for itself, or (b) a todo channel
          if(command.startsWith("help")){
            msg.channel.send(helpText);
          }

          else if(command.startsWith("add ")){
            if(!command.slice(4).includes(";")){
              msg.channel.send("Sorry, please check the format of your command and try again.");
              return;
            }
            let arr = command.slice(4).split(";", 2);
            db.get(`SELECT hour, min FROM timezone WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              let d = Date.parse(arr[0] + " " + timezoneString(row.hour, row.min));
              let it = arr[1].trim();
              if(isNaN(d)){
                msg.channel.send("Sorry, I don't understand your date format! Please try again.");
              }
              else if(it == ""){
                msg.react("😑");
              }
              else if(it.includes("@")){
                msg.channel.send("Sorry, but the task cannot include the @ symbol. Please try again using a different wording.");
              }
              else{
                db.get(`SELECT item FROM todo_${curChanId} WHERE item LIKE ? ORDER BY date`, [it], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  if(row){
                    msg.react("⛔");
                  }
                  else{
                    db.run(`INSERT INTO todo_${curChanId} (date, item) VALUES (?, ?)`, [d/1000, it], (err) => {
                      if(err){
                        return console.error(err.message);
                      }
                      msg.react("🆗");
                    });
                  }
                });
              }
            });
          }

          else if(command.startsWith("list")){
            let str = "";
            db.get(`SELECT hour, min FROM timezone WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              db.serialize(() => {
                db.each(`SELECT datetime(date,'unixepoch','${row.hour} hour','${row.min} minute') date, item FROM todo_${curChanId} ORDER BY date`, [], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  if(row.date.substring(11, 19) == "00:00:00"){
                    str += row.date.substring(0, 10) + " — " + row.item + "\n";
                  }
                  else{
                    str += row.date.substring(0, 16) + " — " + row.item + "\n";
                  }
                });
                db.run("", [], () => {
                  if(str == ""){
                    msg.channel.send("It looks like this to-do list is empty!");
                  }
                  else{
                    msg.channel.send(`✅  **TO-DO LIST**  ✅\n${str}`);
                  }
                });
              });
            });
          }

          else if(command.startsWith("archive") && !command.startsWith("archivechannel")){
            let str = "";
            db.get(`SELECT hour, min FROM timezone WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              db.serialize(() => {
                db.each(`SELECT datetime(date,'unixepoch','${row.hour} hour', '${row.min} minute') date, item FROM archive_${curChanId} ORDER BY date`, [], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  if(row.date.substring(11, 19) == "00:00:00"){
                    str += row.date.substring(0, 10) + " — " + row.item + "\n";
                  }
                  else{
                    str += row.date.substring(0, 16) + " — " + row.item + "\n";
                  }
                });
                db.get(`SELECT todoChan, archiveChan FROM pairs WHERE todoChan = ?`, [curChanId], (err, row) => {
                  if(str == ""){
                    client.channels.cache.get(row.archiveChan).send(`It looks like the archive for <#${row.todoChan}> is empty!`);
                  }
                  else{
                    client.channels.cache.get(row.archiveChan).send(`📁  **ARCHIVED FROM <#${row.todoChan}>**  📁\n${str}`);
                  }
                });
              });
            });
          }

          else if(command.startsWith("done ")){
            let it = "%" + command.slice(5).trim() + "%";
            db.get(`SELECT hour, min FROM timezone WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              db.get(`SELECT datetime(date,'unixepoch','${row.hour} hour','${row.min} minute') date, item FROM todo_${curChanId} WHERE item LIKE ? ORDER BY date`, [it], (err, row) => {
                if(err){
                  return console.error(err.message);
                }
                if(row){
                  if(row.date.substring(11, 19) == "00:00:00"){
                    msg.channel.send(doneText + "\n`" + row.date.substring(0, 10) + " — " + row.item + "`");
                  }
                  else{
                    msg.channel.send(doneText + "\n`" + row.date.substring(0, 16) + " — " + row.item + "`");
                  }
                }
                else{
                  msg.react("🚫");
                }
              });
            });
          }

          else if(command.startsWith("remove ") || command.startsWith("rm ") || command.startsWith("delete ")){
            let it = "";
            let h = 0, m = 0;
            if(command.startsWith("remove ") || command.startsWith("delete ")){
              it = "%" + command.slice(7).trim() + "%";
            }
            else if(command.startsWith("rm ")){
              it = "%" + command.slice(3).trim() + "%";
            }
            db.get(`SELECT hour, min FROM timezone WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              db.get(`SELECT datetime(date,'unixepoch','${row.hour} hour','${row.min} minute') date, item FROM todo_${curChanId} WHERE item LIKE ? ORDER BY date`, [it], (err, row) => {
                if(err){
                  return console.error(err.message);
                }
                if(row){
                  if(row.date.substring(11, 19) == "00:00:00"){
                    msg.channel.send(deleteText + "\n`" + row.date.substring(0, 10) + " — " + row.item + "`");
                  }
                  else{
                    msg.channel.send(deleteText + "\n`" + row.date.substring(0, 16) + " — " + row.item + "`");
                  }
                }
                else{
                  msg.react("🚫");
                }
              });
            });
          }

          else if(command.startsWith("archivechannel")){
            db.get(`SELECT archiveChan FROM pairs WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              msg.channel.send(`The archive channel for <#${curChanId}> is <#${row.archiveChan}>`);
            });
          }

          else if(command.startsWith("setarchivechannel ")){
            if(!msg.member.hasPermission("ADMINISTRATOR")){
              msg.react("⛔");
              return;
            }
            let archiveChanId = command.slice(20, -1);
            if(!msg.guild.channels.cache.find(chan => chan.id == archiveChanId)){
              msg.react("⛔");
              return;
            }
            db.get(`SELECT archiveChan FROM pairs WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              if(row && row.archiveChan == archiveChanId){
                msg.react("🤔");
              }
              else{
                db.get(`SELECT todoChan FROM pairs WHERE todoChan = ?`, [archiveChanId], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  if(row){
                    if(row.todoChan == curChanId){
                      db.run(`UPDATE pairs SET archiveChan = ? WHERE todoChan = ?`, [archiveChanId, curChanId], (err) => {
                        if(err){
                          return console.error(err.message);
                        }
                        msg.react("🆗");
                      });
                    }
                    else{
                      msg.react("⛔");
                    }
                  }
                  else{
                    db.get(`SELECT archiveChan FROM pairs WHERE archiveChan = ?`, [archiveChanId], (err, row) => {
                      if(err){
                        return console.error(err.message);
                      }
                      if(row){
                        msg.react("⛔");
                      }
                      else{
                        db.run(`UPDATE pairs SET archiveChan = ? WHERE todoChan = ?`, [archiveChanId, curChanId], (err) => {
                          if(err){
                            return console.error(err.message);
                          }
                          msg.react("🆗");
                        });
                      }
                    });
                  }
                });
              }
            });
          }

          else if(command.startsWith("peopleadd ")){
            if(!msg.member.hasPermission("ADMINISTRATOR")){
              msg.react("⛔");
              return;
            }
            if(!command.slice(10).includes(";")){
              msg.channel.send("Sorry, please check the format of your command and try again.");
              return;
            }
            let arr = command.slice(10).split(";", 2);
            let p = arr[0].trim();
            let id = arr[1].trim();
            if(!id.startsWith("<@!") || !id.endsWith(">")){
              msg.react("⛔");
            }
            else if(id == "<@!717577524762116109>"){
              msg.react("😳");
            }
            else if(p == "" || id == ""){
              msg.react("😑");
            }
            else if(p.includes("@")){
              msg.channel.send("Sorry, but the name cannot include the @ symbol. Please try again using a different name.");
            }
            else{
              id = id.slice(3, -1);
              if(!msg.guild.members.cache.find(memb => memb.id == id)){
                msg.react("⛔");
              }
              else{
                db.get(`SELECT name FROM people_${curChanId} WHERE name LIKE ? OR userid = ?`, [p, id], (err, row) => {
                  if(err){
                    return console.error(err.message);
                  }
                  if(row){
                    msg.react("⛔");
                  }
                  else{
                    db.run(`INSERT INTO people_${curChanId} (name, userid) VALUES (?, ?)`, [p, id], (err) => {
                      if(err){
                        return console.error(err.message);
                      }
                      msg.react("🆗");
                    });
                  }
                });
              }
            }
          }

          else if(command.startsWith("peoplelist")){
            let str = "";
            db.serialize(() => {
              db.each(`SELECT name, userid FROM people_${curChanId} ORDER BY name`, [], (err, row) => {
                if(err){
                  return console.error(err.message);
                }
                let tag = "?";
                msg.guild.members.cache.find((memb) => {
                  if(memb.id == row.userid){
                    tag = memb.user.tag;
                  }
                });
                str += row.name + " — " + tag + "\n";
              });
              db.run("", [], () => {
                if(str == ""){
                  msg.channel.send("It looks like this list of people is empty!");
                }
                else{
                  msg.channel.send(`👥  **REMINDABLE PEOPLE**  👥\n${str}`);
                }
              });
            });
          }

          else if(command.startsWith("peopleremove ") || command.startsWith("peoplerm ") || command.startsWith("peopledelete ")){
            if(!msg.member.hasPermission("ADMINISTRATOR")){
              msg.react("⛔");
              return;
            }
            let p = "";
            if(command.startsWith("peopleremove ") || command.startsWith("peopledelete ")){
              p = "%" + command.slice(13) + "%";
            }
            else if(command.startsWith("peoplerm ")){
              p = "%" + command.slice(9) + "%";
            }
            db.get(`SELECT name, userid FROM people_${curChanId} WHERE name LIKE ? ORDER BY name`, [p], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              if(row){
                let tag = "?";
                msg.guild.members.cache.find((memb) => {
                  if(memb.id == row.userid){
                    tag = memb.user.tag;
                  }
                });
                msg.channel.send(peopleDeleteText + "\n`" + row.name + " — " + tag + "`");
              }
              else{
                msg.react("🚫");
              }
            });
          }

          else if(command.startsWith("timezone")){
            db.get(`SELECT hour, min FROM timezone WHERE todoChan = ?`, [curChanId], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              msg.channel.send(`The timezone for <#${curChanId}> is ${timezoneString(row.hour, row.min)}`);
            });
          }

          else if(command.startsWith("settimezone ")){
            if(!msg.member.hasPermission("ADMINISTRATOR")){
              msg.react("⛔");
              return;
            }
            let mult = 1;
            if(command.slice(12).includes("-")){
              mult = -1;
            }
            let str = command.slice(12).replace(/-/g, "");
            let arr = str.split(":", 2);
            let h = parseInt(arr[0]);
            let m = parseInt(arr[1]);
            if(isNaN(h) || isNaN(m)){
              msg.channel.send("Sorry, please check the format of your command and try again.");
              return;
            }
            else if(h >= 15 || m >= 60){
              msg.channel.send("Sorry, please ensure that the hour offset is no more than 14 hours, and the minute offset is no more than 59 min.");
              return;
            }
            db.run(`UPDATE timezone SET hour = ?, min = ? WHERE todoChan = ?`, [h * mult, m * mult, curChanId], (err) => {
              if(err){
                return console.error(err.message);
              }
              msg.react("🆗");
            });
          }

          else{
            msg.react("❓");
          }
        }
      });
    });
  }

  else if(msg.author.id === client.user.id && msg.content.startsWith(doneText)){
    curChanId = msg.channel.id;
    msg.react("☑️")
      .then(() => msg.react("❌")
      .then(() => msg.awaitReactions(filter, {max: 1, time: 15000})
      .then((collected) => {
        let react = collected.first();
        if(collected.size == 0 || react.emoji.name === "❌"){
          msg.reactions.removeAll()
            .then(() => msg.react("🚫"));
        }
        else if(react.emoji.name === "☑️"){
          let arr = msg.content.slice(doneText.length + 2, -1).split(" — ");
          db.serialize(() => {
            db.get(`SELECT date, item FROM todo_${curChanId} WHERE item = ? ORDER BY date`, [arr[1]], (err, row) => {
              if(err){
                return console.error(err.message);
              }
              db.run(`INSERT INTO archive_${curChanId} (date, item) VALUES (?, ?)`, [row.date, row.item], (err) => {
                if(err){
                  return console.error(err.message);
                }
              });
            });
            db.run(`DELETE FROM todo_${curChanId} WHERE item = ?`, [arr[1]], (err) => {
              if(err){
                return console.error(err.message);
              }
              msg.reactions.removeAll()
                .then(() => msg.react("✅"));
            });
          });
        }
      })
    ));
  }

  else if(msg.author.id === client.user.id && msg.content.startsWith(deleteText)){
    curChanId = msg.channel.id;
    msg.react("☑️")
      .then(() => msg.react("❌")
      .then(() => msg.awaitReactions(filter, {max: 1, time: 15000})
      .then((collected) => {
        let react = collected.first();
        if(collected.size == 0 || react.emoji.name === "❌"){
          msg.reactions.removeAll()
            .then(() => msg.react("🚫"));
        }
        else if(react.emoji.name === "☑️"){
          let arr = msg.content.slice(deleteText.length + 2, -1).split(" — ")
          db.run(`DELETE FROM todo_${curChanId} WHERE item = ?`, [arr[1]], (err) => {
            if(err){
              return console.error(err.message);
            }
            msg.reactions.removeAll()
              .then(() => msg.react("🗑️"));
          });
        }
      })
    ));
  }

  else if(msg.author.id === client.user.id && msg.content.startsWith(peopleDeleteText)){
    curChanId = msg.channel.id;
    msg.react("☑️")
      .then(() => msg.react("❌")
      .then(() => msg.awaitReactions(filter, {max: 1, time: 15000})
      .then((collected) => {
        let react = collected.first();
        if(collected.size == 0 || react.emoji.name === "❌"){
          msg.reactions.removeAll()
            .then(() => msg.react("🚫"));
        }
        else if(react.emoji.name === "☑️"){
          let arr = msg.content.slice(peopleDeleteText.length + 2, -1).split(" — ")
          db.run(`DELETE FROM people_${curChanId} WHERE name = ?`, [arr[0]], (err) => {
            if(err){
              return console.error(err.message);
            }
            msg.reactions.removeAll()
              .then(() => msg.react("🗑️"));
          });
        }
      })
    ));
  }

});

/////////////////////////////////////////

client.on("disconnect", () => {
  db.close((err) => {
		if(err){
			return console.error(err.message);
		}
		console.log("Closed database connection.\n");
	});
});

client.login(process.env.TOKEN);

/////////////////////////////////////////

function timeAgoString(t){        //convert t seconds into x days/hours/min/sec
  let d = Math.floor(t / 86400);
  t -= d * 86400;
  let h = Math.floor(t / 3600);
  t -= h * 3600;
  let m = Math.floor(t / 60);
  let s = t % 60;
  let ret = "";
  if(d != 0){
    ret += d + " day";
    if(d != 1){
      ret += "s";
    }
    ret += ", ";
  }
  if(h != 0){
    ret += h + " hour";
    if(h != 1){
      ret += "s";
    }
    ret += ", ";
  }
  if(m != 0){
    ret += m + " minute";
    if(m != 1){
      ret += "s";
    }
    ret += " ";
  }
  if(ret != ""){
    ret += "and "
  }
  ret += s + " second";
  if(s != 1){
    ret += "s";
  }
  return ret;
}

function timezoneString(h, m){    //UTC+HH:MM
  let ret = "UTC";
  if(h < 0){
    ret += "-";
  }
  else{
    ret += "+";
  }
  if(Math.abs(h)<10){
    ret += "0";
  }
  ret += Math.abs(h) + ":";
  if(Math.abs(m)<10){
    ret += "0";
  }
  ret += Math.abs(m);
  return ret;
}
