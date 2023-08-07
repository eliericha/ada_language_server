--
--  Copyright (C) <YEAR>, <COPYRIGHT HOLDER>
--
--  SPDX-License-Identifier: MIT
--

package body LSP.Client_Requests.ShowDocument is

   overriding procedure Visit_Client_Receiver
     (Self  : Request;
      Value : in out LSP.Client_Request_Receivers.Client_Request_Receiver'
        Class) is
   begin
      Value.On_ShowDocument_Request (Self.Id, Self.Params);
   end Visit_Client_Receiver;

end LSP.Client_Requests.ShowDocument;
