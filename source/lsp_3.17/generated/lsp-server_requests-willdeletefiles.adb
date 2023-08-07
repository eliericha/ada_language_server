--
--  Copyright (C) <YEAR>, <COPYRIGHT HOLDER>
--
--  SPDX-License-Identifier: MIT
--

package body LSP.Server_Requests.WillDeleteFiles is

   overriding procedure Visit_Server_Receiver
     (Self  : Request;
      Value : in out LSP.Server_Request_Receivers.Server_Request_Receiver'
        Class) is
   begin
      Value.On_WillDeleteFiles_Request (Self.Id, Self.Params);
   end Visit_Server_Receiver;

end LSP.Server_Requests.WillDeleteFiles;
